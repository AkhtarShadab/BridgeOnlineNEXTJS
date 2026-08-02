# BridgeOnline — Documentation

All project documentation lives here. It's organised into three guides plus the
system design document.

```
docs/
├── design-document.md            → architecture, data model, real-time design
├── 1-local-testing-guide/        → run & test everything on your machine
├── 2-deployment-guide/           → ship it (cost tiers, AWS, Kubernetes, scaling)
└── 3-feature-shipping/           → the feature registry & test plans
```

## 1. [Local Testing Guide](./1-local-testing-guide/)

Running and testing BridgeOnline locally, feature by feature.

| Doc | Covers |
|---|---|
| [README](./1-local-testing-guide/README.md) | Dependency install, datastores (Docker), running the app (tsx), every test suite, the **feature‑by‑feature test matrix** (incl. the Redis/BullMQ path), the **account & social layer** (auth, friends, invitations, voice, exit), a **manual 4‑browser play‑test**, and logs/tracing/performance. |
| [kubernetes-local.md](./1-local-testing-guide/kubernetes-local.md) | Test the app on **Docker Desktop's Kubernetes** via a **`type: LoadBalancer`** Service — build, apply, reach it at `localhost`, and read pod logs. |
| [observability.md](./1-local-testing-guide/observability.md) | Logs (Pino), metrics (`/api/metrics`), health (`/api/health`), Sentry, and a one‑command **Prometheus + Grafana** stack to watch a running dev server. |

## 2. [Deployment Guide](./2-deployment-guide/)

Shipping BridgeOnline over the network, and what each capability costs.

| Doc | Covers |
|---|---|
| [README](./2-deployment-guide/README.md) | Production image, the single‑replica‑vs‑Redis constraint, **4 cost tiers (~$5 → ~$400/mo)**, the feature → infrastructure → cost matrix, the voice/TURN tradeoff, and a recommended tooling stack. |
| [aws.md](./2-deployment-guide/aws.md) | Concrete **AWS**: ECS/Fargate · RDS · ElastiCache · ALB (WebSocket + stickiness) · Secrets Manager · CloudWatch/AMP · coturn on EC2, with AWS cost tiers and a pre‑flight checklist. |
| [aws-redis-credits.md](./2-deployment-guide/aws-redis-credits.md) | **AWS $200 credits / free-tier path**: add small Redis for higher game TPS (Lightsail/EC2 + local Redis or ElastiCache micro), keep Supabase Postgres, env template on branch `AWSDep`. |
| [**aws-deploy-step-by-step.md**](./2-deployment-guide/aws-deploy-step-by-step.md) | **What/how/why** CDK + EC2 + Redis + voice deploy: glossary, real cost bands, Free Tier vs credits, OOM/SSM/HTTP lessons from the `AWSDep` run. |
| [service-separation.md](./2-deployment-guide/service-separation.md) | The **web / socket / worker** split topology, sticky‑session ingress annotations, and replica guidance. |
| [observability.md](./2-deployment-guide/observability.md) | Sentry, Prometheus + Grafana (ServiceMonitor, dashboards, alerts), Pino JSON logs (Loki/CloudWatch), health/uptime, and locking down `/api/metrics`. |

## 3. [Feature Shipping](./3-feature-shipping/)

How features were planned and verified.

| Doc | Covers |
|---|---|
| [README](./3-feature-shipping/README.md) | The **feature registry** (00–21): branch, flag, status, and the client‑vs‑server state design. |
| [e2e-test-plan.md](./3-feature-shipping/e2e-test-plan.md) | The Playwright E2E coverage plan for the game‑flow features (06–12): helpers, spec‑by‑spec plan, and risks. |

## Design

- [design-document.md](./design-document.md) — architecture, data model, real‑time design, and the scaling track (Redis adapter, hot/cold state, queue, service separation).

---

> **Costs** quoted in the deployment docs are approximate (early 2026) and for
> relative comparison — verify current provider pricing before committing.
