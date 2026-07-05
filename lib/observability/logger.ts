/**
 * Feature 21 — Pino structured logger.
 *
 * JSON to stdout in production, pretty-printed in dev. Carries correlation
 * IDs (gameId, userId, requestId) via child loggers. Redacts known-sensitive
 * fields as a safety net (passwordHash, TURN_SECRET, password).
 *
 * Usage:
 *   import { logger, gameLogger } from '@/lib/observability/logger';
 *   logger.info({ route: '/api/games/:id' }, 'request received');
 *   gameLogger(gameId, userId).info({ bid }, 'bid placed');
 */

import pino from 'pino';

export const logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    // pino-pretty is a devDependency transport; only enable in dev to keep prod
    // bundle lean. In prod we emit JSON to stdout for log aggregation (Loki /
    // CloudWatch) to pick up.
    transport:
        process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
            : undefined,
    redact: {
        // Match both top-level and nested sensitive fields. pino redact paths
        // use dotted paths; 'passwordHash' matches top-level, '*.passwordHash'
        // matches one level deep, '*.*.passwordHash' two levels, etc.
        paths: [
            'passwordHash', '*.passwordHash', '*.*.passwordHash',
            'TURN_SECRET', '*.TURN_SECRET', '*.*.TURN_SECRET',
            'password', '*.password', '*.*.password',
            'TURN_CREDENTIAL', '*.TURN_CREDENTIAL', '*.*.TURN_CREDENTIAL',
            'credential', '*.credential',
        ],
        censor: '[Redacted]',
    },
});

/** Child logger carrying game + user + request correlation IDs. */
export function gameLogger(gameId?: string, userId?: string, requestId?: string) {
    return logger.child({ gameId, userId, requestId });
}

/** Child logger for a generic request (no game context). */
export function requestLogger(requestId?: string, route?: string) {
    return logger.child({ requestId, route });
}
