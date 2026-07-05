/**
 * Feature 21 — Prometheus metrics (prom-client).
 *
 * Exposes counters + histograms for HTTP, Socket.io, BullMQ, and DB/Redis
 * health. Scraped at GET /api/metrics (no auth — protect via ingress allowlist
 * in production; see deploy/README.md).
 *
 * Usage:
 *   import { metricsRegistry, incrementGamesCompleted, observeHttpRequest } from '@/lib/observability/metrics';
 */

import promClient, { Registry, Counter, Histogram, Gauge } from 'prom-client';

// Use a fresh registry so we don't accidentally include prom-client's default
// metrics twice if the module is re-imported (e.g. in tests).
const registry = new Registry();

// Default process metrics (CPU, memory, GC) — cheap and useful.
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ register: registry });

/* ── HTTP ── */
export const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['route', 'method', 'status'],
    registers: [registry],
});

export const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['route'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
});

/* ── Socket.io ── */
export const socketConnectionsActive = new Gauge({
    name: 'socket_connections_active',
    help: 'Active Socket.io connections',
    registers: [registry],
});

export const socketRoomsActive = new Gauge({
    name: 'socket_rooms_active',
    help: 'Active Socket.io rooms',
    registers: [registry],
});

/* ── BullMQ (Feature 18) ── */
export const bullmqJobsActive = new Gauge({
    name: 'bullmq_jobs_active',
    help: 'Active BullMQ jobs',
    labelNames: ['queue'],
    registers: [registry],
});

export const bullmqJobsDepth = new Gauge({
    name: 'bullmq_jobs_depth',
    help: 'BullMQ queue depth by state',
    labelNames: ['queue', 'state'],
    registers: [registry],
});

/* ── Game lifecycle ── */
export const gamesCompletedTotal = new Counter({
    name: 'games_completed_total',
    help: 'Total completed games (boards)',
    registers: [registry],
});

/** Increment the games-completed counter (called from the play route / worker on COMPLETED). */
export function incrementGamesCompleted(): void {
    gamesCompletedTotal.inc();
}

/** Observe an HTTP request duration + increment the request counter. */
export function observeHttpRequest(route: string, method: string, status: number, durationSeconds: number): void {
    httpRequestsTotal.inc({ route, method, status: String(status) });
    httpRequestDuration.observe({ route }, durationSeconds);
}

export { registry as metricsRegistry };
