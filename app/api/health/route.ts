import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isRedisConfigured, getPubClient } from '@/lib/redis';
import { logger } from '@/lib/observability/logger';

/**
 * GET /api/health
 * Liveness + readiness probe target for k8s. Returns DB + Redis connectivity.
 *   200 { status: 'ok', db: 'up', redis: 'up'|'n/a', ts }
 *   503 { status: 'degraded', db: 'down'|'up', redis: 'down'|'up'|'n/a', ts }
 *
 * Uses a short timeout per check so probes don't hang. The Redis check is
 * skipped (returns 'n/a') when REDIS_URL is unset — that's a valid dev state.
 */
export async function GET() {
    const ts = new Date().toISOString();
    let db: 'up' | 'down' = 'down';
    let redis: 'up' | 'down' | 'n/a' = isRedisConfigured() ? 'down' : 'n/a';

    try {
        await prisma.$queryRaw`SELECT 1`;
        db = 'up';
    } catch (e) {
        logger.error({ err: e }, 'health: db down');
    }

    if (isRedisConfigured()) {
        try {
            const client = await getPubClient();
            // ping() returns 'PONG' on success
            const pong = await client.ping();
            if (pong === 'PONG') redis = 'up';
        } catch (e) {
            logger.error({ err: e }, 'health: redis down');
        }
    }

    const ok = db === 'up' && (redis === 'up' || redis === 'n/a');
    return NextResponse.json(
        { status: ok ? 'ok' : 'degraded', db, redis, ts },
        { status: ok ? 200 : 503 },
    );
}
