import { NextResponse } from 'next/server';
import { metricsRegistry } from '@/lib/observability/metrics';

/**
 * GET /api/metrics
 * Prometheus scrape target. Returns prom-client's text exposition format.
 *
 * SECURITY: this endpoint is UNAUTHENTICATED (Prometheus can't easily carry
 * session cookies). In production, restrict it at the ingress with an IP
 * allowlist (METRICS_ALLOWLIST_CIDR) or service-mesh mTLS. Do NOT expose
 * /api/metrics to the public internet without an allowlist — it leaks internal
 * counters (active connections, queue depth, etc.).
 */
export async function GET() {
    const metrics = await metricsRegistry.metrics();
    return new NextResponse(metrics, {
        headers: { 'Content-Type': metricsRegistry.contentType },
    });
}
