# BridgeOnline — Network Deployment Guide (with cost / feature tradeoffs)

How to actually ship BridgeOnline onto the network, and what each capability
costs. The core theme: **the app is only as expensive as the features you turn
on.** A single‑player‑table hobby deployment is ~$5/mo; a horizontally‑scaled,
voice‑enabled, observable production is ~$150–400+/mo. This guide maps the
spectrum.

> **Pricing note:** figures are **approximate, USD, as of early 2026**, and are
> meant for *relative* comparison. Always confirm current provider pricing.

---

## 1. What you're deploying (and the one hard constraint)

BridgeOnline is a stateful realtime app. In its base form (`server/index.js`,
run via **tsx**) it holds Socket.io rooms and reconnection timers **in process**.

**The single hard rule:** you can only run **one web/socket replica** *unless*
Redis is wired in. The Redis track (Features 13/16/17) exists precisely to lift
that limit:

| To run… | You must have… |
|---|---|
| 1 replica (hobby) | nothing extra — in‑memory works |
| >1 web/socket replica | **Redis** + `@socket.io/redis-adapter` (#13) so broadcasts cross replicas |
| a durable action pipeline | **Redis** + **BullMQ worker** (#15/#18) |
| lower DB write load at scale | **Redis** hot state (#14/#17) |
| independent scaling | **service separation** — web / socket / worker as separate deployments (#17) |

So "cheapest" = single replica, no Redis. "Scalable" = Redis + worker + split
services, which costs more. Pick your tier below.

---

## 2. Build a production image

The server runs TypeScript via **tsx**, and `NEXT_PUBLIC_*` values are **inlined
at build time** — pass them as build args.

```dockerfile
# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps          # bullmq/redis peerOptional conflict
COPY . .
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_FEATURE_NEW_UI=true
ARG NEXT_PUBLIC_FEATURE_AI_HINTS=false
ARG NEXT_PUBLIC_FEATURE_VOICE_CHAT=true
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL \
    NEXT_PUBLIC_FEATURE_NEW_UI=$NEXT_PUBLIC_FEATURE_NEW_UI \
    NEXT_PUBLIC_FEATURE_AI_HINTS=$NEXT_PUBLIC_FEATURE_AI_HINTS \
    NEXT_PUBLIC_FEATURE_VOICE_CHAT=$NEXT_PUBLIC_FEATURE_VOICE_CHAT
RUN npx prisma generate && npm run build

# ---- runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./              # includes tsx + .next + server + lib
EXPOSE 3000 3001
# All-in-one:            CMD ["npm","run","start:all"]
# Split (see topologies): start:web | start:socket | start:worker
CMD ["npm","run","start:all"]
```

**Runtime secrets** (never baked): `DATABASE_URL`, `NEXTAUTH_SECRET`,
`NEXTAUTH_URL`, `REDIS_URL`, `TURN_SECRET`, `SENTRY_DSN`.
Run migrations on release: `npx prisma migrate deploy` (an initContainer/Job).

---

## 3. Deployment tiers & cost

### Tier 0 — Hobby / demo · **~$4–6/mo**

One small VPS, one all‑in‑one container, Postgres alongside (or free managed).
No Redis → single replica → **no horizontal scaling**, but every game feature
works for a handful of concurrent tables.

| Item | Choice | ~$/mo |
|---|---|---|
| Compute | Hetzner CAX11 (2 vCPU/4 GB ARM) or CX22 | 4–5 |
| Postgres | same box (Docker) **or** Neon/Supabase free tier | 0 |
| Redis | — (in‑memory fallback) | 0 |
| TLS/CDN | Caddy/Traefik + Let's Encrypt | 0 |
| **Total** | | **~$4–6** |

**Runs:** `docker compose up` or `npm run start:all`. **Disables:** replicas>1,
durable queue, cross‑instance voice at scale.

---

### Tier 1 — Small production · **~$12–30/mo**

Still one web replica, but **durable data + Redis capabilities** (reconnection
via Redis TTL, adapter ready, optional hot/cold + a worker process on the same
box).

| Item | Choice | ~$/mo |
|---|---|---|
| Compute | 1× VPS (4 GB) | 6–12 |
| Postgres | Managed (Neon/Supabase paid, or DO/RDS micro) | 0–15 |
| Redis | Upstash free/pay‑as‑go, or same‑box container | 0–10 |
| Observability | Sentry free + Grafana Cloud free | 0 |
| **Total** | | **~$12–30** |

**Unlocks:** reliable reconnection (#16), durable action queue if you run
`start:worker` (#15/#18), Sentry error tracking (#20).

---

### Tier 2 — Scalable (Kubernetes) · **~$30–90/mo**

Multiple web/socket replicas behind an ingress with **sticky sessions + Redis
adapter (#13)**, a **separate worker** (#17/#18), Redis, managed Postgres.
Cheapest real k8s = **k3s on 1–2 small nodes**; managed adds a control‑plane/LB fee.

| Item | Choice | ~$/mo |
|---|---|---|
| Cluster | k3s on 2× Hetzner CX22, **or** Civo/LKE small managed | 8–40 |
| Load balancer | k3s Traefik (free) / managed LB | 0–12 |
| Postgres | Managed w/ backups | 15–25 |
| Redis | Managed (Upstash/managed) or in‑cluster | 5–15 |
| Observability | Grafana Cloud free + Sentry team | 0–26 |
| **Total** | | **~$30–90** |

**Unlocks:** horizontal scale of web + socket (**needs #13**), independent
worker scaling, hot/cold Redis state to cut DB writes (#14).

> WebSocket ingress must allow the upgrade + long idle timeouts, and use
> **session affinity** so a client stays on one socket replica. Scale web/socket
> with an HPA; the worker scales on `bullmq_jobs_depth`.

---

### Tier 3 — Production HA + voice + full observability · **~$150–400+/mo**

Multi‑node managed k8s, HA Postgres, HA Redis, **coturn for voice**, full
metrics/log/trace stack.

| Item | ~$/mo |
|---|---|
| Managed k8s (2–3 nodes + control plane + LB) | 80–200 |
| HA Postgres (managed, replicas + backups) | 30–100 |
| HA Redis (managed) | 15–50 |
| **coturn** (voice relay VPS + egress) | 5–100+ (bandwidth‑driven, see §4) |
| Observability (Sentry + Grafana Cloud + log retention) | 20–80 |
| **Total** | | **~$150–400+** |

---

## 4. Feature → infrastructure → cost matrix

| Feature | Needs | Cost impact |
|---|---|---|
| Core game (bidding/play/score) | web + Postgres | baseline |
| Reconnection grace (#8/#16) | in‑memory (1 replica) **or** Redis TTL (many) | $0 → small Redis |
| Redis Socket.io adapter (#13) | Redis | **the gate to replicas>1**; small Redis |
| Hot/cold game state (#14/#17) | Redis | trades Redis $ for **fewer Postgres writes** — worth it at scale |
| BullMQ action queue (#15/#18) | Redis + worker process | +1 worker deployment; durability/retry |
| Service separation (#17) | 3 deployments from 1 image | more pods, finer scaling |
| **Voice / TURN (#18/#20)** | **coturn** server | **bandwidth‑dominated** — see below |
| Observability (#20/#21) | Sentry + Prometheus/Grafana + log sink | mostly free tiers; retention costs |

### Voice is the cost wildcard

WebRTC voice tries **host → STUN(srflx) → TURN(relay)** in order. Only
connections that can't do peer‑to‑peer fall back to **TURN**, which **relays raw
audio** and therefore burns egress bandwidth:

- Typically **~10–20%** of sessions need TURN; audio is ~40–100 kbps/stream.
- **Self‑host coturn** on a VPS with generous included traffic (Hetzner includes
  ~20 TB) → effectively **$5–15/mo** for modest usage. **Cheapest.**
- **Managed TURN** (e.g. Twilio) bills per GB relayed (~$0.40–0.80/GB) → cheap at
  low volume, **expensive** at scale.
- The app already uses **dynamic short‑lived HMAC TURN credentials** (#18) — the
  static `TURN_SECRET` stays server‑side; the client only gets time‑boxed creds.

**Tradeoff:** if you don't need voice, leave `TURN_URL`/`TURN_SECRET` unset (STUN
only) and you pay nothing; enabling reliable voice at scale is the single biggest
recurring line item.

### Observability is nearly free to start

- **Sentry**: free tier (5k errors/mo) → team plan ~$26/mo.
- **Metrics**: `/api/metrics` (Prometheus format) → **Grafana Cloud free tier**
  or a self‑hosted Prometheus+Grafana pod ($0 compute you already run).
- **Logs**: Pino JSON on stdout → Loki (self‑host) or CloudWatch/Datadog (paid
  by retention). Start with stdout + `docker logs` / `kubectl logs` for $0.
- Lock down `/api/metrics` with `METRICS_ALLOWLIST_CIDR` or ingress allowlist.

---

## 5. Recommended path by goal

| Goal | Tier | Monthly |
|---|---|---|
| Show a demo / play with friends | **Tier 0** (1 VPS, no Redis) | **~$5** |
| Small real product, reliable, error‑tracked | **Tier 1** | **~$15–30** |
| Grow past one server, keep it cheap | **Tier 2** (k3s + Redis + worker) | **~$30–90** |
| Public product with voice + HA | **Tier 3** | **~$150–400+** |

**Cheapest sensible production:** Tier 1 — one $6 VPS, **Neon free Postgres**,
**Upstash free Redis**, Sentry free, Grafana Cloud free ⇒ ~**$6–15/mo** with
reconnection, error tracking, and metrics, deferring voice/HA until you need them.

---

## 6. Recommended software & tooling

Concrete picks for *this* app (Next.js custom server + Socket.io + Postgres +
Redis + BullMQ worker + WebRTC voice). "Cheap" = get running for near‑$0;
"Production" = what to grow into.

| Concern | Cheap / start here | Production | Notes for BridgeOnline |
|---|---|---|---|
| Container runtime | **Docker** (Desktop) | containerd (via k8s) | Build image from §2 |
| Local Kubernetes | **k3d** or Docker Desktop k8s | — | For rehearsing manifests locally |
| Orchestrator | **k3s** on a VPS | Managed k8s (Civo / DOKS / LKE / GKE Autopilot) | Single‑node k3s ships Traefik + local‑path storage |
| Ingress + TLS | **Traefik** (bundled in k3s) + **cert‑manager** / Let's Encrypt | ingress‑nginx or Traefik + cert‑manager | **Must allow WS upgrade + session affinity** |
| Web/DNS edge | **Cloudflare** (free) | Cloudflare / provider LB | Proxy + TLS + basic DDoS; enable WebSockets |
| Database | **Neon** or **Supabase** free tier | Managed Postgres w/ replicas (RDS / Cloud SQL) or **CloudNativePG** operator in‑cluster | Prisma; run `migrate deploy` on release |
| Redis | **Upstash** (serverless, free tier) | Managed Redis or **Redis / Bitnami** Helm chart | Needed for replicas>1 (#13), hot/cold (#14), queue (#18) |
| Action worker | same image, `start:worker` | separate Deployment, HPA on `bullmq_jobs_depth` | BullMQ (#15/#18) |
| TURN (voice) | **coturn** self‑hosted on a VPS | coturn cluster, or **Cloudflare Calls / Twilio** TURN | Bandwidth‑driven (§4); app already signs short‑lived creds (#18) |
| Error tracking | **Sentry** free tier | Sentry Team+ | `SENTRY_DSN` at runtime; `@sentry/node` wired via `instrumentation.ts` |
| Metrics | **Grafana Cloud** free, scrape `/api/metrics` | **kube‑prometheus‑stack** (Prometheus + Grafana + Alertmanager) | `prom-client`; firewall `/api/metrics` (`METRICS_ALLOWLIST_CIDR`) |
| Logs | `kubectl logs` / `docker logs` | **Loki** + Promtail (or CloudWatch / Datadog) | Pino emits JSON to stdout in prod |
| Traces | Sentry tracing | **Tempo** + OpenTelemetry | `SENTRY_TRACES_SAMPLE_RATE` |
| Registry | **GHCR** (ghcr.io, free for public) | GHCR / ECR / Artifact Registry | — |
| CI/CD | **GitHub Actions** (already in `.github/workflows`) | Actions + **Argo CD** or **Flux** (GitOps) | `all-tests.yml` gates PRs |
| Secrets | k8s `Secret` + `kubectl create secret` | **External Secrets Operator** or **Sealed Secrets** / SOPS | Never bake `TURN_SECRET`/`NEXTAUTH_SECRET` into the image |
| Uptime | free UptimeRobot on `/api/health` | Grafana synthetic + Alertmanager | `/api/health` returns db+redis status |

**Opinionated minimal‑cost production stack:** k3s on one Hetzner VPS · Traefik +
cert‑manager · **Neon** Postgres (free) · **Upstash** Redis (free) · **Sentry**
free · **Grafana Cloud** free · **coturn** self‑hosted only if voice is needed ·
**GitHub Actions → GHCR → `kubectl apply`** (or Argo CD when you want GitOps).
That's a fully observable, reconnection‑capable deployment for **~$6–15/mo**.

---

## 7. Pre‑flight checklist

- [ ] `NEXT_PUBLIC_*` set at **build** time (baked into the client bundle).
- [ ] Secrets (`DATABASE_URL`, `NEXTAUTH_SECRET`, `REDIS_URL`, `TURN_SECRET`,
      `SENTRY_DSN`) injected at **runtime**, not baked.
- [ ] `npx prisma migrate deploy` runs on each release.
- [ ] Ingress allows **WebSocket upgrade**, long idle timeout, **session
      affinity** (if >1 socket replica).
- [ ] Replicas>1 **only** with `REDIS_URL` set (adapter #13) — else broadcasts
      silently miss clients.
- [ ] `/api/health` wired to liveness/readiness probes; `/api/metrics` firewalled.
- [ ] CORS on the Socket.io server locked to your domain (defaults to `*`).
- [ ] Backups configured for Postgres (and any Redis you treat as source‑of‑truth
      — note hot/cold Redis is a cache, Postgres remains the cold store).

---


## 8. Cloud & topology specifics

This guide covers the general deployment model, tiers, and cost. For concrete,
platform-specific procedures see the companion docs in this folder:

- **[AWS deployment](./aws.md)** — ECS/Fargate · RDS · ElastiCache · ALB (WebSocket + stickiness) · Secrets Manager · CloudWatch/AMP · coturn on EC2, with AWS cost tiers and a pre-flight checklist.
- **[Service separation](./service-separation.md)** — the web / socket / worker split topology, sticky-session ingress, and replica guidance.
- **[Observability in production](./observability.md)** — Sentry, Prometheus + Grafana, Loki logs, health/uptime, and how to lock down `/api/metrics`.

> To **rehearse a Kubernetes deployment locally** first, see
> [Local Kubernetes on Docker Desktop](../1-local-testing-guide/kubernetes-local.md)
> in the local testing guide (`type: LoadBalancer`, build/apply, reading logs).
