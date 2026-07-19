/**
 * Feature 18 — BullMQ action queue for durable game action processing.
 *
 * When `FEATURE_ACTION_QUEUE` is on (and Redis is configured), bid/play actions
 * are enqueued here instead of processed inline in the API route. The Game
 * Worker (server/gameWorker.ts) consumes the queue and processes actions
 * serially per game, eliminating the cross-replica write race.
 *
 * Idempotency: BullMQ `jobId = actionId` (client-generated UUID). Enqueuing the
 * same actionId twice = one job executed once. The worker's processBid/processPlay
 * also guards against double-apply by checking the actionId in the stored state.
 *
 * Kill switch: when `FEATURE_ACTION_QUEUE` is off OR Redis is not configured,
 * the routes process inline (current behavior). `shouldUseQueue()` is the single
 * gate the routes check.
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { isRedisConfigured } from '../redis';
import { isEnabled } from '../features';

export type GameActionType = 'bid' | 'play';

export interface GameAction {
    actionId: string;       // client-generated UUID — dedup key
    gameId: string;
    userId: string;
    type: GameActionType;
    payload: BidPayload | PlayPayload;
}

export interface BidPayload {
    action: 'bid' | 'pass' | 'double' | 'redouble';
    bid?: { level: number; suit: string };
}

export interface PlayPayload {
    card: string; // e.g. "AS"
}

let queue: Queue | null = null;
let connection: IORedis | null = null;

/** True when the queue should be used: Redis configured AND kill switch on. */
export function shouldUseQueue(): boolean {
    return isRedisConfigured() && isEnabled('actionQueue');
}

function getConnection() {
    if (!connection) {
        connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
    }
    return connection as any; // BullMQ ConnectionOptions accepts IORedis at runtime
}

async function getQueue(): Promise<Queue> {
    if (!queue) {
        queue = new Queue('game-actions', {
            connection: getConnection(),
            defaultJobOptions: {
                attempts: 5,
                backoff: { type: 'exponential', delay: 200 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
            },
        });
    }
    return queue;
}

/**
 * Enqueue a game action. The `jobId` is the `actionId`, so enqueuing the same
 * actionId twice is a no-op (BullMQ dedupes by jobId). Returns the job ID.
 */
export async function enqueueGameAction(action: GameAction): Promise<string | undefined> {
    const q = await getQueue();
    const job = await q.add('game-action', action, { jobId: action.actionId });
    return job?.id;
}
