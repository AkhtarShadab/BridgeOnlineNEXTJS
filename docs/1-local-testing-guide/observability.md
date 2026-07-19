# Observability — during local testing

How to watch BridgeOnline while you develop and test it: **logs, metrics,
health, errors/traces**, and a one‑command **Prometheus + Grafana** stack that
scrapes the running app. Everything here works against `npm run dev` (all‑in‑one
server on `http://localhost:3000`).

> The same four signals ship in production — see the deployment counterpart:
> [../2-deployment-guide/observability.md](../2-deployment-guide/observability.md).

The stack (Feature 21) has four pillars, all no‑config in dev:

| Pillar | Local surface | Toggle |
|---|---|---|
| **Logs** — Pino | pretty output in the `npm run dev` terminal | `LOG_LEVEL` |
| **Metrics** — Prometheus | `GET /api/metrics` | always on |
| **Health** — probes | `GET /api/health` | always on |
| **Errors/Traces** — Sentry | no‑op unless `SENTRY_DSN` set | `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE` |

---

## 1. Logs (Pino)

`lib/observability/logger.ts` emits **pretty, colorized** output in development
(`NODE_ENV=development`, via `pino-pretty`) and **single‑line JSON** in
prod/test (for Loki / CloudWatch). Secrets (`password`, `passwordHash`,
`TURN_SECRET`, `credential`, …) are auto‑`[Redacted]`.

```bash
# Verbose dev logs (default level is info)
LOG_LEVEL=debug npm run dev
LOG_LEVEL=trace npm run dev          # everything

# See prod-shape JSON locally, pretty-printed on demand
NODE_ENV=production LOG_LEVEL=debug npm run start:all | npx pino-pretty
```

**Correlation IDs** — use the child loggers so one game/request is traceable
across the request → queue → worker path:

```ts
import { gameLogger } from '@/lib/observability/logger';
gameLogger(gameId, userId, requestId).info({ bid }, 'bid placed');
```

```bash
# Follow one game across JSON logs
npm run start:all 2>&1 | grep '"gameId":"<id>"'
```

## 2. Metrics (Prometheus) — `GET /api/metrics`

`prom-client` exposes the app metrics plus default Node process metrics (CPU,
memory, GC) in the Prometheus text format.

| Metric | Type | Use |
|---|---|---|
| `http_requests_total{route,method,status}` | counter | request volume |
| `http_request_duration_seconds{route}` | histogram | **latency** (p50/p95/p99) |
| `socket_connections_active` | gauge | live players |
| `socket_rooms_active` | gauge | live tables |
| `bullmq_jobs_active{queue}` | gauge | worker throughput |
| `bullmq_jobs_depth{queue,state}` | gauge | **queue backlog** (watch under load) |
| `games_completed_total` | counter | boards finished |

```bash
# Scrape once
curl -s localhost:3000/api/metrics | grep -E 'http_request_duration|bullmq_jobs_depth|socket_connections_active'
```

> `/api/metrics` is **unauthenticated** — that's fine locally, but in production
> it must be firewalled (`METRICS_ALLOWLIST_CIDR` / ingress allowlist).

## 3. Health — `GET /api/health`

```bash
curl -s localhost:3000/api/health | jq
# 200 { "status":"ok", "db":"up", "redis":"up"|"n/a", "ts":"…" }
# 503 { "status":"degraded", ... }   ← DB down, or Redis down when REDIS_URL set
```

`redis` reports `n/a` when `REDIS_URL` is unset (a valid dev state). This is the
same endpoint k8s uses for liveness/readiness probes.

## 4. Errors & traces (Sentry)

Sentry is a **no‑op locally** unless you set a DSN — `captureException` falls
back to `console.error`, so code never branches. To exercise the real path:

```bash
SENTRY_DSN="https://…@sentry.io/123" SENTRY_TRACES_SAMPLE_RATE=1.0 npm run dev
```

It initializes in `instrumentation.ts` on server startup and tags events with
`gameId`/`userId`/`socketId`. For **frontend/flow tracing**, use Playwright
traces (see the [testing guide](./README.md) §7): `--trace on` then
`npx playwright show-trace`.

---

## 5. Local Grafana + Prometheus (visualize the metrics)

Point a throwaway Prometheus + Grafana at the running app. Save these two files
anywhere (e.g. `deploy/observability-local/`) and `docker compose up`.

`prometheus.yml`:

```yaml
global:
  scrape_interval: 5s
scrape_configs:
  - job_name: bridgeonline
    metrics_path: /api/metrics
    static_configs:
      # host.docker.internal = your host, where `npm run dev` listens on :3000
      - targets: ['host.docker.internal:3000']
```

`docker-compose.observability.yml`:

```yaml
services:
  prometheus:
    image: prom/prometheus
    volumes: ['./prometheus.yml:/etc/prometheus/prometheus.yml:ro']
    ports: ['9090:9090']
    extra_hosts: ['host.docker.internal:host-gateway']   # Linux; no-op on Docker Desktop
  grafana:
    image: grafana/grafana
    environment: { GF_AUTH_ANONYMOUS_ENABLED: 'true', GF_AUTH_ANONYMOUS_ORG_ROLE: Admin }
    ports: ['3001:3000']
    depends_on: [prometheus]
```

```bash
docker compose -f docker-compose.observability.yml up -d
```

1. **Prometheus** → http://localhost:9090 → *Status → Targets*: `bridgeonline`
   should be **UP** (start `npm run dev` first).
2. **Grafana** → http://localhost:3001 → *Connections → Add data source →
   Prometheus* → URL `http://prometheus:9090` → **Save & test**.
3. *Dashboards → New → Add visualization* and try these queries:

| Panel | PromQL |
|---|---|
| p95 request latency | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[1m])) by (le))` |
| Requests/sec by status | `sum(rate(http_requests_total[1m])) by (status)` |
| Live players / tables | `socket_connections_active` · `socket_rooms_active` |
| Queue backlog | `bullmq_jobs_depth` |
| Boards completed | `increase(games_completed_total[5m])` |

To generate load while you watch: run several e2e game specs in parallel
(raise `workers` in `playwright.config.ts`) or `npx autocannon -c 50 -d 20
http://localhost:3000/api/health`.

> Docker Desktop resolves `host.docker.internal` automatically. On plain Linux
> the `extra_hosts` line above wires it up.

---

## 6. What to watch, and when

| Symptom | Signal to check |
|---|---|
| Slow UI / API | `http_request_duration_seconds` p95, dev logs for the slow route |
| Actions not applying (queue mode) | `bullmq_jobs_depth` climbing → worker not keeping up / not running |
| "Degraded" app | `/api/health` → which of `db`/`redis` is `down` |
| A specific game misbehaving | filter logs by its `gameId` (correlation IDs) |
| An unhandled crash | Sentry (with DSN) or the `[sentry-fallback]` console line |
