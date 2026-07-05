/**
 * Feature 18 — Game Worker (BullMQ consumer).
 *
 * Consumes the `game-actions` queue and processes bid/play actions through
 * `processBidAction` / `processPlayAction` (from lib/game/actions.ts). Actions
 * are serialized per game (concurrency 1) so the load-modify-write cycle is
 * atomic — no cross-replica write race.
 *
 * Started by server/index.js (all-in-one dev) or server/worker.js (standalone,
 * Feature 19). Graceful shutdown via worker.close() on SIGTERM.
 *
 * Idempotency: BullMQ jobId = actionId dedupes enqueued jobs; the processing
 * functions also check the actionId in stored state to prevent double-apply on
 * retry. Validation failures throw UnrecoverableError → dead-letter queue.
 */

import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { GameAction } from '../lib/queue/gameQueue';
import { processBidAction, processPlayAction } from '../lib/game/actions';
import { isRedisConfigured } from '../lib/redis';

export function startGameWorker() {
    if (!isRedisConfigured()) {
        console.warn('[Game Worker] REDIS_URL not set — worker not started');
        return null;
    }
    const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null }) as any;

    const worker = new Worker(
        'game-actions',
        async (job) => {
            const action = job.data as GameAction;
            const { actionId, gameId, userId, type, payload } = action;

            let result;
            if (type === 'bid') {
                const p = payload as any;
                result = await processBidAction(gameId, userId, p.action, p.bid, actionId);
            } else if (type === 'play') {
                const p = payload as any;
                result = await processPlayAction(gameId, userId, p.card, actionId);
            } else {
                throw new Error(`Unknown action type: ${type}`);
            }

            if (!result.success) {
                // Validation failure (not your turn, illegal card, etc.) — don't retry.
                const err = new Error(result.error || 'Action rejected');
                (err as any).code = 'UNRECOVERABLE';
                throw err;
            }

            return result.data;
        },
        {
            connection,
            concurrency: 1, // serialize per worker — multi-game via multiple workers
        },
    );

    worker.on('completed', (job) => {
        console.log(`[Worker] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
        if ((err as any).code === 'UNRECOVERABLE') {
            console.log(`[Worker] Job ${job?.id} rejected (validation): ${err.message}`);
        } else {
            console.error(`[Worker] Job ${job?.id} failed:`, err.message);
        }
    });

    console.log('[Game Worker] consuming game-actions queue (concurrency: 1)');
    return worker;
}
