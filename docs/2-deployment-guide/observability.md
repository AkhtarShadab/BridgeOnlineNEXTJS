# Observability — in production

Running BridgeOnline's four signals in a real deployment: **error tracking
(Sentry)**, **metrics (Prometheus + Grafana)**, **logs (Pino JSON)**, and
**health/uptime**. Same code as local (Feature 21) — the difference is where
the signals go and how you lock them down.

> Local counterpart (dev loop, one‑command Grafana):
> [../1-local-testing-guide/observability.md](../1-local-testing-guide/observability.md).

Nearly all of this starts on **free tiers**. Enable per component as you need it.

| Component | Cheap / start | Production | Runtime config |
|---|---|---|---|
| Errors/traces | **Sentry** free (5k/mo) | Sentry Team+ | `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE` |
| Metrics | **Grafana Cloud** free scraping `/api/metrics` | kube‑prometheus‑stack | `METRICS_ALLOWLIST_CIDR` |
| Logs | `kubectl logs` / `docker logs` | **Loki**+Promtail, CloudWatch, Datadog | `LOG_LEVEL` |
| Uptime | **UptimeRobot** on `/api/health` | Grafana synthetics + Alertmanager | — |

---

## 1. Errors & traces — Sentry

Inject `SENTRY_DSN` at **runtime** (never bake it). Initialized once per process
in `instrumentation.ts` (Node runtime), so it covers the **web, socket, and
worker** processes alike. Events are tagged with `gameId`/`userId`/`socketId`.

```bash
SENTRY_DSN=https://…@o0.ingest.sentry.io/0
SENTRY_TRACES_SAMPLE_RATE=0.1          # 10% of transactions traced
```

Without a DSN it's a no‑op (`captureException` → `console.error`), so a missing
secret degrades gracefully rather than crashing. Put the DSN in your secret
store (k8s `Secret`, AWS Secrets Manager) — see the [deployment guide](./README.md) §7.

## 2. Metrics — Prometheus + Grafana

The app exposes `GET /api/metrics` (prom‑client text format). See the
[local guide](../1-local-testing-guide/observability.md#2-metrics-prometheus--getapimetrics)
for the full metric list; the ones that matter under load:

- `http_request_duration_seconds` → **p95/p99 latency** per route
- `bullmq_jobs_depth` → **queue backlog** (scale the worker on this)
- `socket_connections_active` / `socket_rooms_active` → live load
- `games_completed_total` → throughput

### Lock it down first

`/api/metrics` is **unauthenticated** and leaks internal counts. Never expose it
publicly. Restrict it:

- **k8s / ingress:** IP allowlist (`METRICS_ALLOWLIST_CIDR`) or a separate
  internal‑only route; scrape it in‑cluster, not through the public ingress.
- **AWS:** a security group that only allows your Prometheus/AMP scraper.

### Scrape it

**Grafana Cloud (cheapest):** run Grafana Agent / Alloy as a sidecar or small
deployment scraping the in‑cluster Service, remote‑writing to Grafana Cloud.

**Self‑hosted (kube‑prometheus‑stack):** a `ServiceMonitor` picks the app up:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: bridge
  labels: { release: kube-prometheus-stack }
spec:
  selector: { matchLabels: { app: bridge } }
  endpoints:
    - port: http            # the Service port exposing 3000
      path: /api/metrics
      interval: 15s
```

### Grafana dashboard — starter panels

| Panel | PromQL |
|---|---|
| p95 latency | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` |
| Error rate | `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))` |
| Queue backlog | `sum(bullmq_jobs_depth) by (state)` |
| Live players / tables | `socket_connections_active` · `socket_rooms_active` |
| Boards/hour | `increase(games_completed_total[1h])` |
| Pod CPU/mem | from `kube-state-metrics` / cAdvisor (kube‑prometheus‑stack) |

## 3. Logs — Pino JSON

In production the logger emits **single‑line JSON to stdout** (no pretty
transport). Ship stdout with the platform's collector:

- **k8s:** `Loki` + `Promtail` (or Grafana Alloy) → query in Grafana alongside
  metrics. Or the cloud provider's agent.
- **AWS ECS:** the `awslogs` driver → **CloudWatch Logs** (Pino JSON is already
  structured, so CloudWatch Insights can query fields directly).
- **Quick look, any platform:** `kubectl logs -f deploy/bridge`,
  `kubectl logs -f -l app=bridge --all-containers --prefix`, or
  `... | npx pino-pretty`.

Raise verbosity with `LOG_LEVEL=debug` (ConfigMap/env) then restart the rollout.
Secrets are redacted in‑logger, but still avoid `LOG_LEVEL=trace` on a public
sink long‑term.

## 4. Health & uptime — `GET /api/health`

Returns `{status, db, redis, ts}` with `200`/`503`. Wire it to:

- **k8s probes** — liveness + readiness (see [kubernetes-local.md](../1-local-testing-guide/kubernetes-local.md)
  and [service-separation.md](./service-separation.md); the health route reports
  `db`+`redis` so a degraded dependency de‑registers the pod).
- **AWS ALB** — target‑group health check path `/api/health`.
- **External uptime** — UptimeRobot / Grafana synthetic monitoring hitting the
  public URL; alert on non‑200.

## 5. Alerts worth setting first

| Alert | Condition (starting point) |
|---|---|
| App degraded | `/api/health` non‑200 for 1m (or `up == 0`) |
| Latency SLO | p95 `http_request_duration_seconds` > 1s for 5m |
| Queue backing up | `bullmq_jobs_depth` (waiting) > N for 5m → scale worker |
| Error spike | 5xx rate > 2% for 5m |
| Error budget | Sentry issue‑spike / new‑issue notifications |

---

## Cost note

Observability is nearly free to start: Sentry free tier, **Grafana Cloud free**
(scrape `/api/metrics`), and stdout logs via `kubectl logs` for $0. Retention is
what costs money later — add Loki/long‑retention only when you need history. See
the [deployment guide](./README.md) §4 "Observability is nearly free to start".
