/**
 * Feature 21 — Sentry initialization (no-op without SENTRY_DSN).
 *
 * Captures unhandled errors in the Next.js / Socket.io / Game Worker processes.
 * Game engine throws, Zod validation escapes, Prisma disconnects, and socket
 * handler crashes surface as events tagged with gameId/userId/socketId via
 * `captureException(err, { extra })`.
 *
 * Initialized by instrumentation.ts on server startup. When SENTRY_DSN is
 * unset (local dev), `initSentry` is a no-op and `captureException` is a
 * console.error fallback — so calling code never needs to branch.
 */

import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentry(): void {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
        // No DSN — Sentry is a no-op. captureException falls back to console.
        return;
    }
    Sentry.init({
        dsn,
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
        environment: process.env.NODE_ENV ?? 'development',
    });
    initialized = true;
    console.log('[sentry] Initialized (tracesSampleRate=' + (process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1) + ')');
}

/** Capture an exception with optional context tags. No-op fallback when Sentry is unset. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
    if (initialized) {
        Sentry.captureException(err, { extra: context });
    } else {
        console.error('[sentry-fallback] Exception:', err, context ?? {});
    }
}

/** Wrap an async handler so unhandled errors are captured + rethrown. */
export function withSentry<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    context?: Record<string, unknown>,
): (...args: TArgs) => Promise<TResult> {
    return async (...args: TArgs) => {
        try {
            return await fn(...args);
        } catch (err) {
            captureException(err, context);
            throw err;
        }
    };
}
