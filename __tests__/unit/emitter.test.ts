import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Feature 19 — lib/socket/emitter.ts unit tests (no Redis, no DB).
 * Tests the loud-failure contract and the singleton behavior.
 */

describe('getBroadcastEmitter', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        delete process.env.REDIS_URL;
    });

    it('throws a clear error when REDIS_URL is unset', async () => {
        delete process.env.REDIS_URL;
        const { getBroadcastEmitter } = await import('@/lib/socket/emitter');
        await expect(getBroadcastEmitter()).rejects.toThrow(/REDIS_URL not set/);
    });

    it('throws when REDIS_URL is empty', async () => {
        process.env.REDIS_URL = '';
        const { getBroadcastEmitter } = await import('@/lib/socket/emitter');
        await expect(getBroadcastEmitter()).rejects.toThrow(/REDIS_URL not set/);
    });

    it('constructs a broadcast-only emitter when Redis is configured (live Redis)', async () => {
        process.env.REDIS_URL = 'redis://localhost:6380';
        // Use the real socket.io + redis-adapter against a live Redis (if up).
        // This is an integration-flavored unit test; skip if Redis isn't reachable.
        const { createClient } = await import('redis');
        const probe = createClient({ url: 'redis://localhost:6380', socket: { connectTimeout: 1000 } });
        try {
            await probe.connect();
            await probe.quit();
        } catch {
            console.log('[emitter] Redis not reachable — skipping construction test');
            return;
        }

        const { getBroadcastEmitter } = await import('@/lib/socket/emitter');
        const io = await getBroadcastEmitter();
        expect(io).toBeTruthy();
        // Singleton: second call returns the same instance.
        const io2 = await getBroadcastEmitter();
        expect(io2).toBe(io);
    });
});
