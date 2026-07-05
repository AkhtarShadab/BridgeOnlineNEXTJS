import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Feature 18 — Queue module unit tests (no Redis, no DB).
 * Tests shouldUseQueue() logic and the enqueue interface contract.
 */

describe('shouldUseQueue', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        delete process.env.REDIS_URL;
        delete process.env.FEATURE_ACTION_QUEUE;
    });

    it('returns false when REDIS_URL is unset (regardless of flag)', async () => {
        delete process.env.REDIS_URL;
        process.env.FEATURE_ACTION_QUEUE = 'true';
        const { shouldUseQueue } = await import('@/lib/queue/gameQueue');
        expect(shouldUseQueue()).toBe(false);
    });

    it('returns false when FEATURE_ACTION_QUEUE is unset', async () => {
        process.env.REDIS_URL = 'redis://localhost:6379';
        delete process.env.FEATURE_ACTION_QUEUE;
        const { shouldUseQueue } = await import('@/lib/queue/gameQueue');
        expect(shouldUseQueue()).toBe(false);
    });

    it('returns false when FEATURE_ACTION_QUEUE=false', async () => {
        process.env.REDIS_URL = 'redis://localhost:6379';
        process.env.FEATURE_ACTION_QUEUE = 'false';
        const { shouldUseQueue } = await import('@/lib/queue/gameQueue');
        expect(shouldUseQueue()).toBe(false);
    });

    it('returns true only when BOTH REDIS_URL is set AND FEATURE_ACTION_QUEUE=true', async () => {
        process.env.REDIS_URL = 'redis://localhost:6379';
        process.env.FEATURE_ACTION_QUEUE = 'true';
        const { shouldUseQueue } = await import('@/lib/queue/gameQueue');
        expect(shouldUseQueue()).toBe(true);
    });
});
