import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Feature 16 — lib/redis.ts configuration detection + fallback logic.
 * These tests do NOT require a running Redis; they verify the single capability
 * gate (isRedisConfigured) and the loud-failure contract (getPubClient /
 * getSubClient throw when Redis is unconfigured, so wiring bugs surface instead
 * of silently no-oping).
 */

const REDIS_URL = 'REDIS_URL';

let savedUrl: string | undefined;

beforeEach(() => {
  savedUrl = process.env[REDIS_URL];
  // reset module registry so singleton state doesn't leak between tests
  vi.resetModules();
});

afterEach(() => {
  if (savedUrl === undefined) delete process.env[REDIS_URL];
  else process.env[REDIS_URL] = savedUrl;
});

describe('isRedisConfigured', () => {
  it('returns false when REDIS_URL is unset', async () => {
    delete process.env[REDIS_URL];
    const { isRedisConfigured } = await import('@/lib/redis');
    expect(isRedisConfigured()).toBe(false);
  });

  it('returns false when REDIS_URL is empty', async () => {
    process.env[REDIS_URL] = '';
    const { isRedisConfigured } = await import('@/lib/redis');
    expect(isRedisConfigured()).toBe(false);
  });

  it('returns true when REDIS_URL is set', async () => {
    process.env[REDIS_URL] = 'redis://localhost:6379';
    const { isRedisConfigured } = await import('@/lib/redis');
    expect(isRedisConfigured()).toBe(true);
  });
});

describe('getPubClient / getSubClient — loud failure when unconfigured', () => {
  it('getPubClient throws a clear error when REDIS_URL is unset', async () => {
    delete process.env[REDIS_URL];
    const { getPubClient } = await import('@/lib/redis');
    await expect(getPubClient()).rejects.toThrow(/REDIS_URL is not set/);
  });

  it('getSubClient throws a clear error when REDIS_URL is unset', async () => {
    delete process.env[REDIS_URL];
    const { getSubClient } = await import('@/lib/redis');
    await expect(getSubClient()).rejects.toThrow(/REDIS_URL is not set/);
  });

  it('error message tells callers to check isRedisConfigured first', async () => {
    delete process.env[REDIS_URL];
    const { getPubClient } = await import('@/lib/redis');
    await expect(getPubClient()).rejects.toThrow(/isRedisConfigured/);
  });
});

describe('closeRedisClients — safe no-op when nothing is open', () => {
  it('does not throw when called before any client was created', async () => {
    delete process.env[REDIS_URL];
    const { closeRedisClients } = await import('@/lib/redis');
    await expect(closeRedisClients()).resolves.toBeUndefined();
  });
});
