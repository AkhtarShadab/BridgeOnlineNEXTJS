import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Feature 17 — GameStateStore unit tests (no DB, no Redis).
 * Tests the PostgresGameStateStore with a mocked Prisma client and the
 * RedisGameStateStore with a mocked Redis client. Verifies the interface
 * contract: save→load round-trip, phaseTransition snapshot behavior, evict.
 */

// Shared mock state object shape
const mockState = {
    hands: { NORTH: ['AS', 'KS'], SOUTH: ['2H'], EAST: [], WEST: [] },
    bidHistory: [{ type: 'bid', player: 'NORTH', level: 1, suit: 'NT' }],
    tricks: [],
    currentTrick: [],
    currentBid: { level: 1, suit: 'NT' },
    trumpSuit: 'NT',
    contract: null,
    vulnerability: { NS: false, EW: false },
    dealer: 'NORTH',
    passCount: 0,
};

describe('PostgresGameStateStore', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
    });

    it('save→load round-trips the state object', async () => {
        // Mock prisma: findUnique returns the state on load; update captures saves.
        const updateMock = vi.fn().mockResolvedValue({});
        const findUniqueMock = vi.fn().mockResolvedValue({ gameState: mockState });
        vi.doMock('@/lib/db', () => ({
            prisma: {
                game: { findUnique: findUniqueMock, update: updateMock },
            },
        }));
        // Force Postgres store: Redis not configured + flag off
        delete process.env.REDIS_URL;
        vi.doMock('@/lib/features', () => ({ isEnabled: () => false }));
        vi.doMock('@/lib/redis', () => ({ isRedisConfigured: () => false }));

        const { getGameStateStore, _resetGameStateStoreForTest } = await import('@/lib/game/gameStateStore');
        _resetGameStateStoreForTest();
        const store = getGameStateStore();

        await store.save('game-1', mockState as any, { phaseTransition: false });
        const loaded = await store.load('game-1');

        expect(loaded).toEqual(mockState);
        // Postgres store: every save writes to Postgres (no phaseTransition distinction)
        expect(updateMock).toHaveBeenCalledTimes(1);
        expect(findUniqueMock).toHaveBeenCalledTimes(1);
    });

    it('snapshot is a no-op on Postgres store (state already persisted)', async () => {
        const updateMock = vi.fn().mockResolvedValue({});
        vi.doMock('@/lib/db', () => ({ prisma: { game: { update: updateMock, findUnique: vi.fn() } } }));
        delete process.env.REDIS_URL;
        vi.doMock('@/lib/features', () => ({ isEnabled: () => false }));
        vi.doMock('@/lib/redis', () => ({ isRedisConfigured: () => false }));

        const { getGameStateStore, _resetGameStateStoreForTest } = await import('@/lib/game/gameStateStore');
        _resetGameStateStoreForTest();
        const store = getGameStateStore();

        await store.snapshot('game-1');
        // Postgres store: snapshot does nothing extra (save already persisted)
        expect(updateMock).not.toHaveBeenCalled();
    });

    it('evict is a no-op on Postgres store', async () => {
        vi.doMock('@/lib/db', () => ({ prisma: { game: {} } }));
        delete process.env.REDIS_URL;
        vi.doMock('@/lib/features', () => ({ isEnabled: () => false }));
        vi.doMock('@/lib/redis', () => ({ isRedisConfigured: () => false }));

        const { getGameStateStore, _resetGameStateStoreForTest } = await import('@/lib/game/gameStateStore');
        _resetGameStateStoreForTest();
        const store = getGameStateStore();

        // Should not throw
        await expect(store.evict('game-1')).resolves.toBeUndefined();
    });
});

describe('RedisGameStateStore', () => {
    let redisGet: ReturnType<typeof vi.fn>;
    let redisSet: ReturnType<typeof vi.fn>;
    let redisDel: ReturnType<typeof vi.fn>;
    let prismaUpdate: ReturnType<typeof vi.fn>;
    let prismaFindUnique: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
        redisGet = vi.fn();
        redisSet = vi.fn();
        redisDel = vi.fn();
        prismaUpdate = vi.fn().mockResolvedValue({});
        prismaFindUnique = vi.fn();

        process.env.REDIS_URL = 'redis://localhost:6380';
        vi.doMock('@/lib/redis', () => ({
            isRedisConfigured: () => true,
            getPubClient: async () => ({ get: redisGet, set: redisSet, del: redisDel }),
        }));
        vi.doMock('@/lib/features', () => ({ isEnabled: (f: string) => f === 'hotColdState' }));
        vi.doMock('@/lib/db', () => ({
            prisma: { game: { update: prismaUpdate, findUnique: prismaFindUnique } },
        }));
    });

    afterEach(() => {
        delete process.env.REDIS_URL;
    });

    it('save writes to Redis with TTL; phaseTransition:false does NOT write Postgres', async () => {
        const { getGameStateStore, _resetGameStateStoreForTest } = await import('@/lib/game/gameStateStore');
        _resetGameStateStoreForTest();
        const store = getGameStateStore();

        await store.save('game-1', mockState as any, { phaseTransition: false });

        // Redis SET called with key + JSON + TTL
        expect(redisSet).toHaveBeenCalledTimes(1);
        const [key, json, opts] = redisSet.mock.calls[0];
        expect(key).toBe('game:game-1:state');
        expect(JSON.parse(json)).toEqual(mockState);
        expect(opts).toEqual({ EX: 14400 }); // 4h
        // Postgres NOT written (no phase transition)
        expect(prismaUpdate).not.toHaveBeenCalled();
    });

    it('save with phaseTransition:true writes BOTH Redis and Postgres', async () => {
        const { getGameStateStore, _resetGameStateStoreForTest } = await import('@/lib/game/gameStateStore');
        _resetGameStateStoreForTest();
        const store = getGameStateStore();

        await store.save('game-1', mockState as any, { phaseTransition: true });

        expect(redisSet).toHaveBeenCalledTimes(1);
        expect(prismaUpdate).toHaveBeenCalledTimes(1);
        // Postgres update includes the gameState
        const updateArgs = prismaUpdate.mock.calls[0][0];
        expect(updateArgs.where.id).toBe('game-1');
        expect(updateArgs.data.gameState).toEqual(mockState);
    });

    it('load reads from Redis on hit (no Postgres fetch)', async () => {
        redisGet.mockResolvedValue(JSON.stringify(mockState));

        const { getGameStateStore, _resetGameStateStoreForTest } = await import('@/lib/game/gameStateStore');
        _resetGameStateStoreForTest();
        const store = getGameStateStore();

        const loaded = await store.load('game-1');

        expect(loaded).toEqual(mockState);
        expect(redisGet).toHaveBeenCalledWith('game:game-1:state');
        expect(prismaFindUnique).not.toHaveBeenCalled(); // no Postgres fallback
    });

    it('load falls back to Postgres on Redis miss and warms Redis', async () => {
        redisGet.mockResolvedValue(null); // Redis miss
        prismaFindUnique.mockResolvedValue({ gameState: mockState });

        const { getGameStateStore, _resetGameStateStoreForTest } = await import('@/lib/game/gameStateStore');
        _resetGameStateStoreForTest();
        const store = getGameStateStore();

        const loaded = await store.load('game-1');

        expect(loaded).toEqual(mockState);
        expect(prismaFindUnique).toHaveBeenCalledTimes(1);
        // Redis warmed with the Postgres value
        expect(redisSet).toHaveBeenCalledTimes(1);
    });

    it('evict deletes the Redis key', async () => {
        const { getGameStateStore, _resetGameStateStoreForTest } = await import('@/lib/game/gameStateStore');
        _resetGameStateStoreForTest();
        const store = getGameStateStore();

        await store.evict('game-1');

        expect(redisDel).toHaveBeenCalledWith('game:game-1:state');
    });

    it('snapshot reads Redis and writes Postgres', async () => {
        redisGet.mockResolvedValue(JSON.stringify(mockState));

        const { getGameStateStore, _resetGameStateStoreForTest } = await import('@/lib/game/gameStateStore');
        _resetGameStateStoreForTest();
        const store = getGameStateStore();

        await store.snapshot('game-1');

        expect(redisGet).toHaveBeenCalledWith('game:game-1:state');
        expect(prismaUpdate).toHaveBeenCalledTimes(1);
        expect(prismaUpdate.mock.calls[0][0].data.gameState).toEqual(mockState);
    });
});
