/**
 * Feature 19 — Standalone Game Worker entry (worker service).
 *
 * Hosts only the BullMQ Game Worker (Feature 18). No HTTP, no Socket.io
 * connections. Broadcasts emitted during action processing go through a
 * broadcast-only Socket.io emitter (lib/socket/emitter.ts) that publishes to
 * Redis pub/sub; the standalone socket service (server/socket.js) owns the
 * actual WebSocket connections and fans the emits out to clients.
 *
 *   node server/worker.js   (or: npm run start:worker)
 */

import { startGameWorker } from './gameWorker.ts';
import { getBroadcastEmitter } from '../lib/socket/emitter.ts';
import { isRedisConfigured } from '../lib/redis.ts';
import { shouldUseQueue } from '../lib/queue/gameQueue.ts';

async function main() {
    if (!isRedisConfigured()) {
        console.error('[worker] REDIS_URL not set — worker requires Redis. Exiting.');
        process.exit(1);
    }
    if (!shouldUseQueue()) {
        console.error('[worker] FEATURE_ACTION_QUEUE is not enabled. Exiting.');
        process.exit(1);
    }

    // Set global.io to a broadcast-only emitter so the action processing code
    // (which calls `global.io.to(room).emit(...)`) publishes via Redis pub/sub
    // instead of needing a real Socket.io server. The socket service owns the
    // actual connections.
    global.io = await getBroadcastEmitter();

    const worker = startGameWorker();
    if (!worker) {
        console.error('[worker] Failed to start worker. Exiting.');
        process.exit(1);
    }

    process.on('SIGTERM', async () => {
        console.log('[worker] SIGTERM received, shutting down...');
        await worker.close();
        process.exit(0);
    });
}

main().catch((err) => {
    console.error('[worker] Fatal:', err);
    process.exit(1);
});
