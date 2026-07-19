/**
 * Feature 19 — Broadcast-only Socket.io emitter.
 *
 * Used by the Game Worker (and optionally API routes) to emit events to rooms
 * WITHOUT owning any socket connections. Constructs a SocketIOServer with the
 * Redis adapter attached but never calls `listen()`/`attach()` — it's purely a
 * publish-side handle. The Redis adapter fans the emit out to whatever Socket.io
 * servers ARE listening (the standalone `server/socket.js` service in production,
 * or the all-in-one `server/index.js` in dev).
 *
 * This is the canonical Socket.io "emitter" pattern: the worker broadcasts via
 * Redis pub/sub; the socket service owns the actual WebSocket connections.
 *
 * Falls back to `null` (no-op) when Redis is not configured — in dev without
 * Redis, the all-in-one `server/index.js` owns the real `io` and the worker
 * path isn't used anyway (FEATURE_ACTION_QUEUE requires Redis).
 */

import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { isRedisConfigured, getPubClient, getSubClient } from '../redis';

let emitter: SocketIOServer | null = null;

/**
 * Returns a broadcast-only SocketIOServer with the Redis adapter attached.
 * Call `io.to(room).emit(...)` on it; never call `listen()`/`attach()`.
 * Throws if Redis is not configured — callers must check `isRedisConfigured()`
 * first (the worker is only started when Redis is up).
 */
export async function getBroadcastEmitter(): Promise<SocketIOServer> {
    if (!isRedisConfigured()) {
        throw new Error('[emitter] REDIS_URL not set — broadcast emitter requires Redis');
    }
    if (!emitter) {
        emitter = new SocketIOServer(); // no http server → never listens
        const [pub, sub] = await Promise.all([getPubClient(), getSubClient()]);
        emitter.adapter(createAdapter(pub, sub));
        console.log('[emitter] Broadcast-only Socket.io emitter created (Redis adapter, no listen)');
    }
    return emitter;
}
