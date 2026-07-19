/**
 * Feature 17 — Hot/Cold Game State Store.
 *
 * Hot state (the active `gameState` blob: hands, bidHistory, tricks,
 * currentTrick, contract, vulnerability) is read/written through this
 * abstraction. Two implementations:
 *
 *   - `RedisGameStateStore`  — hot state in Redis (key `game:{id}:state`,
 *     4h TTL), snapshots to Postgres `games.game_state` only on phase
 *     transitions (BIDDING→PLAYING, PLAYING→SCORING, SCORING→COMPLETED).
 *   - `PostgresGameStateStore` — current behavior: every save writes
 *     `games.game_state`. Used when Redis is not configured (dev fallback)
 *     OR when the `FEATURE_HOT_COLD_STATE` kill switch is off.
 *
 * Selection: `getGameStateStore()` returns the Redis store only when
 * `isRedisConfigured()` AND the `hotColdState` flag are both true. The flag
 * is the per-feature kill switch (ops can flip it off to fall back to the
 * Postgres-only path without unsetting REDIS_URL, which would also kill the
 * Socket.io adapter from Feature 16). The capability (REDIS_URL) is detected
 * by `isRedisConfigured()`; the flag only selects whether the capability is
 * *used* for game state.
 *
 * Race-safety: Redis SET/GET are atomic per key, but the load-modify-write
 * cycle in the route is NOT atomic across requests. Today's Postgres path has
 * the same race (no row locking). This feature does not introduce a new race;
 * it preserves the existing one. The real fix is Feature 18 (BullMQ
 * serializes actions per game). Until Feature 18 ships, keep `replicas: 1`
 * for the game-mutation path even though the Socket.io adapter (Feature 16)
 * allows >1.
 */

import { prisma } from '../db';
import { isRedisConfigured, getPubClient } from '../redis';
import { isEnabled } from '../features';

/** The shape of the JSONB `games.game_state` column. */
export interface GameState {
    hands: Record<string, string[]>;
    bidHistory: any[];
    tricks: any[];
    currentTrick: any[];
    currentBid: any;
    trumpSuit: any;
    contract: any;
    vulnerability: any;
    dealer: string;
    passCount: number;
    [key: string]: unknown;
}

export interface GameStateStore {
    load(gameId: string): Promise<GameState | null>;
    /** Persist hot state. If `phaseTransition` is true, also flush a snapshot to Postgres. */
    save(gameId: string, state: GameState, opts: { phaseTransition?: boolean }): Promise<void>;
    /** Force-flush the current hot state to Postgres (used on COMPLETED / shutdown). */
    snapshot(gameId: string): Promise<void>;
    /** Drop the hot key (after COMPLETED + snapshot, or on game abort). */
    evict(gameId: string): Promise<void>;
}

/** 4-hour TTL on hot state keys. Refreshed on every save. */
const HOT_STATE_TTL_SECONDS = 60 * 60 * 4;

function redisKey(gameId: string): string {
    return `game:${gameId}:state`;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  PostgresGameStateStore — dev fallback / kill-switch-off path         */
/*  Identical semantics to the pre-Feature-17 code: every save writes    */
/*  games.game_state. No Redis dependency.                               */
/* ────────────────────────────────────────────────────────────────────── */

class PostgresGameStateStore implements GameStateStore {
    async load(gameId: string): Promise<GameState | null> {
        const game = await prisma.game.findUnique({
            where: { id: gameId },
            select: { gameState: true },
        });
        return (game?.gameState as unknown as GameState) ?? null;
    }

    async save(gameId: string, state: GameState, _opts: { phaseTransition?: boolean }): Promise<void> {
        // Postgres path: every save is a snapshot (the blob is small enough at
        // our scale, and there's no Redis to hold the hot copy). The
        // phaseTransition flag is irrelevant here — we always persist.
        await prisma.game.update({
            where: { id: gameId },
            data: { gameState: state as object },
        });
    }

    async snapshot(gameId: string): Promise<void> {
        // Already persisted by the last save; nothing extra to do.
        void gameId;
    }

    async evict(gameId: string): Promise<void> {
        // No hot key to drop. Void to satisfy the interface.
        void gameId;
    }
}

/* ────────────────────────────────────────────────────────────────────── */
/*  RedisGameStateStore — hot in Redis, cold snapshots on phase changes  */
/* ────────────────────────────────────────────────────────────────────── */

class RedisGameStateStore implements GameStateStore {
    private async client() {
        return getPubClient();
    }

    async load(gameId: string): Promise<GameState | null> {
        const client = await this.client();
        const raw = await client.get(redisKey(gameId));
        if (raw) {
            try {
                return JSON.parse(raw) as GameState;
            } catch {
                // Corrupt JSON — fall through to Postgres and re-warm.
            }
        }
        // Miss / corrupt: fall back to Postgres and warm Redis.
        const game = await prisma.game.findUnique({
            where: { id: gameId },
            select: { gameState: true },
        });
        const state = (game?.gameState as unknown as GameState) ?? null;
        if (state) {
            await client.set(redisKey(gameId), JSON.stringify(state), { EX: HOT_STATE_TTL_SECONDS });
        }
        return state;
    }

    async save(gameId: string, state: GameState, opts: { phaseTransition?: boolean }): Promise<void> {
        const client = await this.client();
        // Always write the hot copy + refresh TTL.
        await client.set(redisKey(gameId), JSON.stringify(state), { EX: HOT_STATE_TTL_SECONDS });
        // Only flush to Postgres on phase transitions (the cold snapshot).
        if (opts.phaseTransition) {
            await prisma.game.update({
                where: { id: gameId },
                data: { gameState: state as object },
            });
        }
    }

    async snapshot(gameId: string): Promise<void> {
        const client = await this.client();
        const raw = await client.get(redisKey(gameId));
        if (raw) {
            await prisma.game.update({
                where: { id: gameId },
                data: { gameState: JSON.parse(raw) as object },
            });
        } else {
            // No hot copy to snapshot — read from Postgres (no-op effectively).
            // This branch is defensive; the route should call snapshot only
            // when a hot copy exists.
        }
    }

    async evict(gameId: string): Promise<void> {
        const client = await this.client();
        await client.del(redisKey(gameId));
    }
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Selector                                                             */
/* ────────────────────────────────────────────────────────────────────── */

let cachedStore: GameStateStore | null = null;

/**
 * Returns the active game-state store. The Redis store is used only when
 * Redis is configured AND the `hotColdState` kill switch is on. Otherwise the
 * Postgres store (current behavior) is used. Result is cached for the process
 * lifetime — store selection does not change at runtime.
 */
export function getGameStateStore(): GameStateStore {
    if (cachedStore) return cachedStore;
    const useRedis = isRedisConfigured() && isEnabled('hotColdState');
    cachedStore = useRedis ? new RedisGameStateStore() : new PostgresGameStateStore();
    if (useRedis) {
        console.log('[gameStateStore] RedisGameStateStore active (hot in Redis, snapshots on phase transitions)');
    } else {
        const reason = !isRedisConfigured()
            ? 'REDIS_URL unset (dev fallback)'
            : 'FEATURE_HOT_COLD_STATE=false (kill switch off)';
        console.log(`[gameStateStore] PostgresGameStateStore active (${reason})`);
    }
    return cachedStore;
}

/** Test hook: reset the cached store so env/flag changes take effect. */
export function _resetGameStateStoreForTest(): void {
    cachedStore = null;
}

/** Test hook: expose the Redis key for assertions without importing the private fn. */
export function _redisKeyForTest(gameId: string): string {
    return redisKey(gameId);
}
