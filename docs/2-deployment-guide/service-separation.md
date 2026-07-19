# Feature 19 — Service Separation Deployment

Three independently deployable units sharing only Redis + PostgreSQL.
See [../design-document.md](../design-document.md) §8.5 + §10.

## Services

| Service | Entry | Port | Scales on | Notes |
|---|---|---|---|---|
| **web** | `server/next.js` (`npm run start:web`) | `PORT_WEB` (3000) | HTTP traffic | Stateless. API routes enqueue to BullMQ (Feature 18); broadcasts are the worker's job. |
| **socket** | `server/socket.js` (`npm run start:socket`) | `PORT_SOCKET` (3001) | Socket.io connections | Redis adapter (Feature 16). **Sticky sessions required** at the ingress for the upgrade handshake. |
| **worker** | `server/worker.js` (`npm run start:worker`) | none (headless) | BullMQ queue depth | Concurrency 1 per worker replica; add replicas for more concurrent games. Broadcasts via the Redis emitter (`lib/socket/emitter.ts`). |

## Local dev (all-in-one)

```bash
npm run dev   # server/index.js — runs web + socket + worker in one process
```

No behavior change from pre-Feature-19. The split entries are for production.

## Production (split)

```bash
npm run start:web     # container 1
npm run start:socket  # container 2
npm run start:worker  # container 3 (only if FEATURE_ACTION_QUEUE=true)
```

Each in its own container/pod, sharing `DATABASE_URL` + `REDIS_URL`.

## k8s manifests

See `deploy/k8s/` (when added) for:
- `web-deployment.yaml` + `web-service.yaml` + liveness/readiness on `/api/health` (Feature 21)
- `socket-deployment.yaml` + `socket-service.yaml` + sticky-session ingress annotations
- `worker-deployment.yaml` (headless, no Service) + HPA on queue depth
- `ingress.yaml` — routes `/socket.io/*` → socket-svc, `/*` → web-svc
- `configmap.yaml` — shared `DATABASE_URL`, `REDIS_URL`, feature flags

## Ingress annotations (Socket.io sticky sessions)

```yaml
nginx.ingress.kubernetes.io/affinity: cookie
nginx.ingress.kubernetes.io/session-cookie-hash: sha1
nginx.ingress.kubernetes.io/session-cookie-name: socketio_route
```

Applied to the `/socket.io/` Ingress rule only. Required even with the Redis
adapter — the adapter handles cross-process broadcast, not the upgrade handshake.

## Replica guidance

- **web**: `replicas: 2+` (stateless, safe at any count).
- **socket**: `replicas: 2+` (Redis adapter handles cross-process rooms).
- **worker**: `replicas: 2+` only after Feature 18 ships (serialized per-game).
- **API mutation safety**: until Feature 18, keep the web Deployment at
  `replicas: 1` (the load-modify-write cycle isn't serialized). With Feature 18,
  the queue serializes actions, so web can scale freely.
