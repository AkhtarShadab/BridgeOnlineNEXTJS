/**
 * Feature 21 — Next.js instrumentation hook.
 *
 * Runs once on server startup (Node.js runtime only). Initializes Sentry +
 * confirms the Pino logger is constructed. See:
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { initSentry } = await import('./lib/observability/sentry');
        initSentry();
        const { logger } = await import('./lib/observability/logger');
        logger.info({ event: 'server_startup' }, 'observability initialized');
    }
}
