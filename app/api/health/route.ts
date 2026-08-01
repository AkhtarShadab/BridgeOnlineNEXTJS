import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isRedisConfigured, getPubClient } from '@/lib/redis';
import { logger } from '@/lib/observability/logger';

/**
 * GET /api/health
 * Liveness probe: always 200 if the process responds.
 * Body includes db/redis readiness so operators can still see connectivity.
 *
 * (Render free deploys were timing out when DATABASE_URL was wrong and this
 * endpoint returned 503 — keep probes from blocking process start.)
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
        { status: 200 },
    );
}
