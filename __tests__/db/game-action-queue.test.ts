import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { testPrisma, cleanDatabase, createTestUser, createTestRoom } from '../helpers/test-prisma';
import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { GamePhase } from '@prisma/client';

/**
 * Feature 18 — BullMQ queue integration test (live Redis + Postgres).
 * Creates a Queue + Worker directly (bypassing the cached module singletons)
 * for full control. Tests: enqueue→process→state updated, idempotency, inline.
 *
 * Requires: docker compose -f docker-compose.test.yml up -d (postgres + redis).
 */

process.env.FEATURE_ACTION_QUEUE = 'true';
process.env.FEATURE_HOT_COLD_STATE = 'false'; // Postgres store — isolates queue from state storage
process.env.REDIS_URL = process.env.REDIS_URL_TEST ?? 'redis://localhost:6380';

const REDIS_URL = process.env.REDIS_URL;
let connection: IORedis;

beforeAll(async () => {
    await testPrisma.$connect();
    connection = new IORedis(REDIS_URL!, { maxRetriesPerRequest: null });
});

afterAll(async () => {
    await connection?.quit().catch(() => {});
    await cleanDatabase();
    await testPrisma.$disconnect();
});

beforeEach(async () => {
    await cleanDatabase();
    // Obliterate the queue between tests so stale jobs don't interfere.
    // Use a duplicate connection so closing the cleanup queue doesn't kill
    // the shared `connection` used by the tests.
    try {
        const cleanupConn = connection.duplicate();
        const q = new Queue('game-actions', { connection: cleanupConn });
        await q.obliterate({ force: true });
        await q.close();
        await cleanupConn.quit();
    } catch {}
});

afterEach(async () => {
    // Workers are closed in each test.
});

const baseState = {
    hands: { NORTH: ['AS', 'KS', '2H'], SOUTH: ['QD'], EAST: ['JC'], WEST: ['TD'] },
    bidHistory: [] as any[],
    tricks: [], currentTrick: [], currentBid: null, trumpSuit: null,
    contract: null, vulnerability: { NS: false, EW: false }, dealer: 'NORTH', passCount: 0,
};

async function seedGame() {
    const seats = ['NORTH', 'SOUTH', 'EAST', 'WEST'] as const;
    const users = await Promise.all([createTestUser(), createTestUser(), createTestUser(), createTestUser()]);
    const room = await createTestRoom(users[0].id);
    await Promise.all(users.map((u, i) =>
        testPrisma.gamePlayer.create({ data: { gameRoomId: room.id, userId: u.id, seat: seats[i] } })
    ));
    const game = await testPrisma.game.create({
        data: {
            gameRoomId: room.id, phase: GamePhase.BIDDING, boardNumber: 1,
            dealerId: users[0].id, currentPlayerId: users[0].id, gameState: baseState as any,
        },
    });
    await testPrisma.gamePlayer.updateMany({ where: { gameRoomId: room.id }, data: { gameId: game.id } });
    return { users, room, game };
}

describe('Feature 18 — BullMQ queue (live Redis + Postgres)', () => {
    it('enqueues a bid and the worker processes it (gameState updated)', async () => {
        const { users, game } = await seedGame();
        const actionId = 'test-action-001';
        const { processBidAction } = await import('../../lib/game/actions');

        const queue = new Queue('game-actions', { connection });
        let workerRef: Worker | null = null;
        const completed = new Promise<void>((resolve, reject) => {
            workerRef = new Worker('game-actions', async (job) => {
                const { actionId, gameId, userId, type, payload } = job.data;
                if (type === 'bid') {
                    const p = payload as any;
                    return processBidAction(gameId, userId, p.action, p.bid, actionId);
                }
                throw new Error('unknown');
            }, { connection, concurrency: 1 });
            workerRef.on('completed', () => resolve());
            workerRef.on('failed', (_, err) => reject(err));
            setTimeout(() => reject(new Error('worker timeout')), 10_000);
        });

        await queue.add('game-action', {
            actionId, gameId: game.id, userId: users[0].id, type: 'bid', payload: { action: 'pass' },
        }, { jobId: actionId });

        await completed;
        await workerRef?.close();
        await queue.close();

        const updated = await testPrisma.game.findUnique({ where: { id: game.id }, select: { gameState: true } });
        const state = updated!.gameState as any;
        expect(state.bidHistory).toHaveLength(1);
        expect(state.bidHistory[0].type).toBe('pass');
        expect(state.bidHistory[0].actionId).toBe(actionId);
    }, 20_000);

    it('idempotency: same actionId enqueued twice = one mutation', async () => {
        const { users, game } = await seedGame();
        const actionId = 'test-action-002';
        const { processBidAction } = await import('../../lib/game/actions');

        const queue = new Queue('game-actions', { connection });
        let processCount = 0;

        // Create worker that counts processing
        const w = new Worker('game-actions', async (job) => {
            processCount++;
            const { actionId, gameId, userId, type, payload } = job.data;
            if (type === 'bid') return processBidAction(gameId, userId, (payload as any).action, (payload as any).bid, actionId);
            throw new Error('unknown');
        }, { connection, concurrency: 1 });

        // Attach completed handler BEFORE enqueuing to avoid missing the event.
        const firstDone = new Promise<void>((resolve, reject) => {
            w.once('completed', () => resolve());
            w.once('failed', (_, err) => reject(err));
            setTimeout(() => reject(new Error('worker timeout')), 10_000);
        });

        // Enqueue once
        await queue.add('game-action', { actionId, gameId: game.id, userId: users[0].id, type: 'bid', payload: { action: 'pass' } }, { jobId: actionId });

        // Wait for the first job to complete
        await firstDone;

        expect(processCount).toBe(1);

        // Try to enqueue the same actionId again — BullMQ should dedup (jobId exists).
        // The second add returns the existing completed job without creating a new one.
        await queue.add('game-action', { actionId, gameId: game.id, userId: users[0].id, type: 'bid', payload: { action: 'pass' } }, { jobId: actionId });

        // Wait a moment to confirm no second processing occurs
        await new Promise((r) => setTimeout(r, 1000));
        expect(processCount).toBe(1); // still 1 — deduped

        // bidHistory has exactly 1 entry (not 2)
        const updated = await testPrisma.game.findUnique({ where: { id: game.id }, select: { gameState: true } });
        expect((updated!.gameState as any).bidHistory).toHaveLength(1);

        await w.close();
        await queue.close();
    }, 20_000);

    it('inline path: processBidAction directly (no queue)', async () => {
        const { users, game } = await seedGame();
        const { processBidAction } = await import('../../lib/game/actions');
        const result = await processBidAction(game.id, users[0].id, 'pass', undefined, 'inline-001');
        expect(result.success).toBe(true);
        const updated = await testPrisma.game.findUnique({ where: { id: game.id }, select: { gameState: true } });
        expect((updated!.gameState as any).bidHistory).toHaveLength(1);
    });
});
