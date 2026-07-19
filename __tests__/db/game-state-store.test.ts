import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPrisma, cleanDatabase, createTestUser, createTestRoom } from '../helpers/test-prisma';
import { createClient, type RedisClientType } from 'redis';
import { GamePhase } from '@prisma/client';

/**
 * Feature 17 — DB + Redis integration: the RedisGameStateStore stores hot state
 * in Redis and only snapshots to Postgres on phase transitions.
 *
 * Requires: docker compose -f docker-compose.test.yml up -d (postgres + redis).
 * The test DB must have FEATURE_HOT_COLD_STATE=true for the Redis store to be
 * selected — we set it in process.env before importing the store.
 */

// Enable the hot/cold flag BEFORE importing the store so getGameStateStore()
// selects the Redis implementation.
process.env.FEATURE_HOT_COLD_STATE = 'true';
process.env.REDIS_URL = process.env.REDIS_URL_TEST ?? 'redis://localhost:6380';

const REDIS_URL = process.env.REDIS_URL;
const redis = createClient({ url: REDIS_URL, socket: { connectTimeout: 5000 } }) as RedisClientType;

let store: any;
let _reset: () => void;
let redisKey: (gameId: string) => string;

beforeAll(async () => {
    await testPrisma.$connect();
    await redis.connect();
    const mod = await import('../../lib/game/gameStateStore');
    store = mod.getGameStateStore();
    _reset = mod._resetGameStateStoreForTest;
    redisKey = mod._redisKeyForTest;
    _reset();
    store = mod.getGameStateStore();
});

afterAll(async () => {
    await redis.quit().catch(() => {});
    await cleanDatabase();
    await testPrisma.$disconnect();
});

beforeEach(async () => {
    await cleanDatabase();
    // Flush Redis game keys between tests
    const keys = await redis.keys('game:*');
    if (keys.length > 0) await redis.del(keys);
});

const baseState = {
    hands: { NORTH: ['AS', 'KS', '2H'], SOUTH: ['QD'], EAST: ['JC'], WEST: ['TD'] },
    bidHistory: [] as any[],
    tricks: [],
    currentTrick: [],
    currentBid: null,
    trumpSuit: null,
    contract: null,
    vulnerability: { NS: false, EW: false },
    dealer: 'NORTH',
    passCount: 0,
};

async function seedGame() {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const game = await testPrisma.game.create({
        data: {
            gameRoomId: room.id,
            phase: GamePhase.BIDDING,
            boardNumber: 1,
            dealerId: user.id,
            currentPlayerId: user.id,
            gameState: baseState as any,
        },
    });
    return { user, room, game };
}

describe('Feature 17 — RedisGameStateStore (live Redis + Postgres)', () => {
    it('save with phaseTransition:false writes Redis but NOT Postgres', async () => {
        const { game } = await seedGame();
        const pgBefore = await testPrisma.game.findUnique({ where: { id: game.id }, select: { gameState: true } });

        const newState = { ...baseState, bidHistory: [{ type: 'bid', player: 'NORTH', level: 1, suit: 'NT' }] };
        await store.save(game.id, newState as any, { phaseTransition: false });

        // Redis has the new state
        const raw = await redis.get(redisKey(game.id));
        expect(raw).toBeTruthy();
        expect(JSON.parse(raw!).bidHistory).toHaveLength(1);

        // Postgres gameState is UNCHANGED (no snapshot)
        const pgAfter = await testPrisma.game.findUnique({ where: { id: game.id }, select: { gameState: true } });
        expect(pgAfter!.gameState).toEqual(pgBefore!.gameState);
    });

    it('save with phaseTransition:true writes BOTH Redis and Postgres', async () => {
        const { game } = await seedGame();
        const newState = { ...baseState, contract: { level: 3, suit: 'NT', declarer: 'NORTH', doubled: false, redoubled: false } };

        await store.save(game.id, newState as any, { phaseTransition: true });

        // Redis has the new state
        const raw = await redis.get(redisKey(game.id));
        expect(JSON.parse(raw!).contract).toEqual(newState.contract);

        // Postgres gameState IS updated (snapshot)
        const pgAfter = await testPrisma.game.findUnique({ where: { id: game.id }, select: { gameState: true } });
        expect((pgAfter!.gameState as any).contract).toEqual(newState.contract);
    });

    it('load reads from Redis on hit (no Postgres query)', async () => {
        const { game } = await seedGame();
        const hotState = { ...baseState, bidHistory: [{ type: 'pass', player: 'NORTH' }] };
        await store.save(game.id, hotState as any, { phaseTransition: false });

        const loaded = await store.load(game.id);
        expect(loaded).toEqual(hotState);
    });

    it('load falls back to Postgres on Redis miss and re-warms Redis', async () => {
        const { game } = await seedGame();
        // Don't seed Redis — only Postgres has the state (from seedGame's create).

        const loaded = await store.load(game.id);
        expect(loaded).toEqual(baseState);

        // Redis now warmed
        const raw = await redis.get(redisKey(game.id));
        expect(raw).toBeTruthy();
        expect(JSON.parse(raw!)).toEqual(baseState);
    });

    it('evict removes the Redis key', async () => {
        const { game } = await seedGame();
        await store.save(game.id, baseState as any, { phaseTransition: false });
        expect(await redis.get(redisKey(game.id))).toBeTruthy();

        await store.evict(game.id);
        expect(await redis.get(redisKey(game.id))).toBeNull();
    });

    it('snapshot flushes the Redis hot state to Postgres', async () => {
        const { game } = await seedGame();
        const hotState = { ...baseState, bidHistory: [{ type: 'bid', player: 'NORTH', level: 2, suit: 'C' }] };
        // Write to Redis only (no Postgres snapshot)
        await store.save(game.id, hotState as any, { phaseTransition: false });
        // Postgres still has the original state
        const pgBefore = await testPrisma.game.findUnique({ where: { id: game.id }, select: { gameState: true } });
        expect((pgBefore!.gameState as any).bidHistory).toHaveLength(0);

        // Snapshot → flush to Postgres
        await store.snapshot(game.id);

        const pgAfter = await testPrisma.game.findUnique({ where: { id: game.id }, select: { gameState: true } });
        expect((pgAfter!.gameState as any).bidHistory).toHaveLength(1);
    });

    it('simulates a full bid sequence: 3 non-transition saves then 1 transition save', async () => {
        const { game } = await seedGame();
        const pgBefore = await testPrisma.game.findUnique({ where: { id: game.id }, select: { gameState: true } });

        // Three bids (no phase transition — bidding still ongoing)
        for (let i = 0; i < 3; i++) {
            const state = { ...baseState, bidHistory: [...baseState.bidHistory, { type: 'pass', player: `seat-${i}` }] };
            await store.save(game.id, state as any, { phaseTransition: false });
        }
        // Postgres still unchanged
        const pgMid = await testPrisma.game.findUnique({ where: { id: game.id }, select: { gameState: true } });
        expect(pgMid!.gameState).toEqual(pgBefore!.gameState);

        // Phase transition: BIDDING → PLAYING (auction complete)
        const finalState = {
            ...baseState,
            bidHistory: [
                { type: 'bid', player: 'NORTH', level: 1, suit: 'NT' },
                { type: 'pass', player: 'EAST' },
                { type: 'pass', player: 'SOUTH' },
                { type: 'pass', player: 'WEST' },
            ],
            contract: { level: 1, suit: 'NT', declarer: 'NORTH', doubled: false, redoubled: false },
        };
        await store.save(game.id, finalState as any, { phaseTransition: true });

        // Postgres NOW updated
        const pgAfter = await testPrisma.game.findUnique({ where: { id: game.id }, select: { gameState: true } });
        expect((pgAfter!.gameState as any).contract).toEqual(finalState.contract);
        expect((pgAfter!.gameState as any).bidHistory).toHaveLength(4);
    });
});
