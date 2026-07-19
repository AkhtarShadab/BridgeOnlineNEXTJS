/**
 * Feature 16 — Redis client singleton for the Socket.io adapter (and, later,
 * the hot/cold state store + BullMQ queue).
 *
 * The Redis *capability* is detected by `isRedisConfigured()`. This is the
 * single knob for "is Redis available" — there is deliberately NO
 * `FEATURE_REDIS` flag, because a flag that disagrees with `REDIS_URL` fails
 * silently in two of four states. See lib/features.ts for the rationale.
 *
 * Per-feature kill switches (`FEATURE_HOT_COLD_STATE`, `FEATURE_ACTION_QUEUE`)
 * select whether the Feature 17/18 code paths *use* Redis once it's available;
 * they do not gate this module.
 *
 * Graceful fallback: when `REDIS_URL` is unset (local dev), `isRedisConfigured()`
 * is false and callers fall back to in-memory behavior (Socket.io's default
 * adapter, PostgresGameStateStore, inline API processing). `getPubClient()` /
 * `getSubClient()` throw a clear error when Redis is not configured, so wiring
 * bugs surface loudly instead of silently no-oping.
 */

import { createClient, type RedisClientType } from 'redis';

let pubClient: RedisClientType | null = null;
let subClient: RedisClientType | null = null;

/** True when REDIS_URL is set to a non-empty value. The single capability gate. */
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL && process.env.REDIS_URL.length > 0;
}

/**
 * Dedicated pub client for `@socket.io/redis-adapter`'s `createAdapter(pub, sub)`.
 * Throws if Redis is not configured — callers must check `isRedisConfigured()`
 * first and fall back to the in-memory adapter when false.
 */
export async function getPubClient(): Promise<RedisClientType> {
  if (!isRedisConfigured()) {
    throw new Error(
      '[redis] REDIS_URL is not set — call isRedisConfigured() before getPubClient()',
    );
  }
  if (!pubClient) {
    pubClient = createClient({ url: process.env.REDIS_URL }) as RedisClientType;
    pubClient.on('error', (e) => console.error('[redis pub]', e.message));
    await pubClient.connect();
  }
  return pubClient;
}

/**
 * Dedicated sub client. Must be a separate instance from the pub client
 * (redis-adapter requires two clients so subscribe traffic doesn't block
 * publish traffic).
 */
export async function getSubClient(): Promise<RedisClientType> {
  if (!isRedisConfigured()) {
    throw new Error(
      '[redis] REDIS_URL is not set — call isRedisConfigured() before getSubClient()',
    );
  }
  if (!subClient) {
    subClient = createClient({ url: process.env.REDIS_URL }) as RedisClientType;
    subClient.on('error', (e) => console.error('[redis sub]', e.message));
    await subClient.connect();
  }
  return subClient;
}

/** Graceful shutdown: quit both clients and reset the singletons. */
export async function closeRedisClients(): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (pubClient) {
    tasks.push(pubClient.quit().catch(() => {}));
    pubClient = null;
  }
  if (subClient) {
    tasks.push(subClient.quit().catch(() => {}));
    subClient = null;
  }
  await Promise.all(tasks);
}
