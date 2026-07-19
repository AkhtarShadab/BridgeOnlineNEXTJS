# BridgeOnline — End‑to‑End Local Testing Guide

A practical, feature‑by‑feature guide to running and testing BridgeOnline on your own
machine: installing dependencies, driving every feature, generating logs, capturing
traces, and checking performance.

> BridgeOnline is a Next.js 15 app with a **custom server** (`server/index.js` =
> Next.js **+** Socket.io on one process) run via **tsx**, backed by
> **PostgreSQL** (Prisma) and optionally **Redis** (Socket.io adapter, hot/cold
> game state, BullMQ action queue). Auth is NextAuth. Voice is WebRTC.

---

## 1. Prerequisites & dependency installation

| Tool | Version | Why |
|---|---|---|
| Node.js | **22.x** | Matches CI; the custom server runs on it |
| npm | 10+ | Package manager |
| Docker + Docker Compose | any recent | Test Postgres (5433) + Redis (6380) |
| Git | any | — |

```bash
# 1) Install JS deps. NOTE: bullmq declares a peerOptional redis>=5 while the
#    project pins redis@4.7.1, so plain `npm install` errors on peer resolution.
npm install --legacy-peer-deps

# 2) Generate the Prisma client
npx prisma generate

# 3) Install the Playwright browser used by e2e (Chromium)
npx playwright install chromium
#    On Linux CI you also need: sudo npx playwright install-deps chromium
```

### Datastores (Docker)

The repo ships `docker-compose.test.yml` with both services on **non‑default host
ports** so they never clash with a local dev DB/Redis:

```bash
# Postgres :5433  +  Redis :6380  (tmpfs — wiped on restart, fast)
npm run test:db:start      # docker compose up -d && sleep 3
# ...
npm run test:db:stop       # tear down
```

- **Postgres** `localhost:5433` (user/pass/db = `test`/`test`/`bridgeonline_test`)
- **Redis** `localhost:6380`

For the **real dev app** (not tests) you need your own Postgres — either a local
install or a container — referenced by `.env` (default `localhost:5432`). Redis is
optional in dev (features fall back to in‑memory / Postgres‑only when `REDIS_URL`
is unset).

---

## 2. Environment configuration

Copy the template and fill values:

```bash
cp .env.example .env          # real dev app
# .env.test already exists for the test suites (gitignored)
```

Key variables (full list in `.env.example`):

| Variable | Purpose | Local default |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Postgres | `postgresql://…@localhost:5432/bridgeonline` |
| `NEXTAUTH_SECRET` | Session signing | `openssl rand -base64 32` |
| `NEXT_PUBLIC_SOCKET_URL` | Client → Socket.io URL | `http://localhost:3000` (all‑in‑one) |
| `REDIS_URL` | Enables Redis adapter / hot‑cold / queue capability | unset = in‑memory fallback |
| `LOG_LEVEL` | Pino level (`trace`…`error`) | `info` |
| `SENTRY_DSN` | Error tracking | unset = Sentry no‑op |
| `TURN_URL` / `TURN_SECRET` / `TURN_TTL` | Voice relay creds (server‑only secret) | unset = STUN/host only |

### Feature flags (each maps to a feature you'll test)

`NEXT_PUBLIC_*` flags are **inlined at build time** — set them *before* `next build`;
in dev they're read at runtime.

| Flag | Feature | Notes |
|---|---|---|
| `FEATURE_NEW_UI` / `NEXT_PUBLIC_FEATURE_NEW_UI` | 01 dark UI | server + client twin |
| `FEATURE_AI_HINTS` / `NEXT_PUBLIC_FEATURE_AI_HINTS` | 02/12 hint button | backend is a 501 stub (deferred) |
| `FEATURE_VOICE_CHAT` / `NEXT_PUBLIC_FEATURE_VOICE_CHAT` | voice chat | `NEXT_PUBLIC_DISABLE_VOICE=true` hard‑off |
| `FEATURE_RECONNECT_GRACE` / `NEXT_PUBLIC_…` | 08/16 reconnection | 30s grace; Redis TTL when `REDIS_URL` set |
| `FEATURE_HOT_COLD_STATE` | 14/17 Redis hot state | requires `REDIS_URL` |
| `FEATURE_ACTION_QUEUE` | 15/18 BullMQ queue | requires `REDIS_URL` **and** the worker process |
| `REDIS_URL` | 13/16 Socket.io adapter | capability switch (no flag) |

---

## 3. Running the app locally

```bash
# All‑in‑one (Next + Socket.io + worker in one process) — the default dev path
npm run dev                    # → tsx server/index.js on http://localhost:3000

# Split services (mirrors production topology, Feature 17)
npm run start:web              # Next.js        (PORT_WEB=3000)
npm run start:socket           # Socket.io      (PORT_SOCKET=3001)
npm run start:worker           # BullMQ worker  (consumes game-actions)
```

> The server runs TypeScript through **tsx**, and `next.config.ts` marks
> `pino`, `bullmq`, `ioredis`, `@sentry/node`, etc. as `serverExternalPackages`
> so their worker threads aren't broken by bundling. If you see
> `.next/server/vendor-chunks/lib/worker.js not found`, that config regressed.

---

## 4. Test suites — what each covers

| Command | Runner | Needs | Covers |
|---|---|---|---|
| `npm test` | Vitest | — | Pure logic: bidding, scoring, cards, **stats**, feature flags |
| `npm run test:socket` | Vitest | Redis (6380) | Socket.io relay + **Redis‑adapter cross‑replica** (#13) |
| `npm run test:db` | Vitest | Postgres (5433) | DB integration: rooms, users/**stats**, hand filtering |
| `npm run test:e2e` | Playwright | Postgres (+Redis) | Full 4‑player browser flows |
| `npm run test:all` | all of the above, in order | Postgres + Redis | Everything |

```bash
# Bring datastores up first (test:socket/test:db assume they're running)
npm run test:db:start

npm test
npm run test:socket
npm run test:db
npm run test:e2e            # global-setup auto-detects the DB and pushes schema
npm run test:all           # unit → socket → db → e2e

# Interactive / debugging
npm run test:e2e:ui        # Playwright UI mode (pick, watch, time-travel)
npm run test:e2e:headed    # real visible Chromium window
npx playwright test bidding.spec.ts:5    # a single test
```

> The e2e **`global-setup`** is probe‑first: if Postgres is already listening it
> uses it and skips Docker (so CI's service container and your local container
> both work); otherwise it runs `docker compose up`. It then `prisma db push`es
> the schema.

---

## 5. Feature‑by‑feature test matrix

Set the flags in the left‑hand column (in `.env.test` for suites, `.env` for the
running app), then run the listed spec / manual check.

| Feature | Flags / prereqs | How to test |
|---|---|---|
| 00 SYS_FUNC flags | — | `npm test` → `features.test.ts` |
| 01 Dark UI | `NEXT_PUBLIC_FEATURE_NEW_UI=true` | `npx playwright test ui-redesign.spec.ts` |
| 05 Playing table | — | `playing.spec.ts` |
| 06 Trick lifecycle | — | `trick-lifecycle.spec.ts` (winner pulse + 1.5s hold) |
| 07 Play sync / optimistic | — | `playing.spec.ts` (tap‑to‑select, error toast) |
| 08/16 Reconnection | `FEATURE_RECONNECT_GRACE=true` (+`REDIS_URL` for TTL mode) | `reconnect.spec.ts`; manually: reload mid‑game, seat restored within 30s |
| 09 Mobile / touch | — | `mobile.spec.ts` (BidDrawer FAB, two‑tap) |
| 10 Score depth | — | `scorecard.spec.ts` |
| 11 Auction review | — | `auction-drawer.spec.ts` |
| 12 Hint button | `NEXT_PUBLIC_FEATURE_AI_HINTS=true` | `hint-button.spec.ts` (button renders; click → 501 error toast) |
| 14 Games counter / stats | — | `npm test` `stats.test.ts`; `stats.spec.ts` (dashboard Games Played ↑) |
| 13/16 Redis Socket.io adapter | `REDIS_URL` set | `test:socket` `redis-adapter.test.ts` (two servers, cross‑server delivery) |
| 14/17 Hot/cold state | `FEATURE_HOT_COLD_STATE=true` + `REDIS_URL` | play a full board; assert state round‑trips Redis→Postgres snapshot on phase change |
| 15/18 BullMQ queue | `FEATURE_ACTION_QUEUE=true` + `REDIS_URL` + **worker running** | play API returns `{queued:true, actionId}`; board still completes; replay same `actionId` = no double‑apply |
| 17 Service separation | — | run `start:web`+`start:socket`+`start:worker`; game works across processes |
| 18/20 Dynamic TURN creds | `TURN_URL`+`TURN_SECRET` | `GET /api/voice/turn-credentials` returns short‑lived `iceServers`+`expiresAt`; no secret in client bundle |
| 19 PG indexes | migrated DB | `EXPLAIN (ANALYZE)` the hot queries (see §7) — confirm index usage |
| 20/21 Observability | — | `GET /api/health`, `GET /api/metrics`, read structured logs (see §6/§7) |

### Account & social layer (not numbered — always on)

The feature matrix above tracks the *numbered* game/scaling features. The app also
ships an **account and social layer** that every game sits on top of. Test it the
same way — flags‑free, either by the listed spec or the manual steps in §5a.

| Area | Routes / components | How to test |
|---|---|---|
| Auth — register / login | `/register`, `/login`, `app/api/auth/register`, `[...nextauth]` | `npx playwright test auth.spec.ts`; manual: register → redirected to `/login?registered=true` → log in |
| Room lifecycle | `/create-room`, `/join-room`, `app/room/[roomId]`, `/api/rooms/{create,join,[id]/{seat,ready,start}}` | `room-lifecycle.spec.ts`, `room-start.spec.ts` |
| Active‑room redirect | `ActiveRoomChecker.tsx`, `useActiveRoomRedirect.ts`, `/api/active-room` | manual: while seated in a room, open `/dashboard` → you're bounced back into the live room |
| Friends | `/dashboard/friends`, `/api/friends/{search,request,respond,list,remove,[id]}` | manual only (no dedicated spec) — see §5a.1 |
| Room invitations | `InviteFriendsModal.tsx`, `/invitations`, `/api/invitations`, `/api/rooms/[id]/invite` | manual only — see §5a.2 |
| Voice chat (WebRTC) | `useVoiceChat.ts`, `webrtc-manager.ts`, `PlayerVoiceBadge`, `VoiceParticipant` | `voice-signaling.spec.ts` (e2e) + `test:socket` `voice-signaling.test.ts` (signaling relay); manual mic test in §5a.3 |
| Leave / exit game | `/api/games/[gameId]/exit` | manual: click **Leave** in‑game → seat freed, others notified |

> These are covered indirectly by `full-game.spec.ts` (register → room → full board)
> and the socket suites, but there are **no** friends/invitations e2e specs yet, so
> exercise those two by hand (§5a).

---

## 5a. Manual walkthrough — account & social features

Run the app (`npm run dev`) and use **two different browsers / cookie jars** (see
§8.1 for why) so you can be two users at once.

### 5a.1 Friends (add → accept → remove)

1. Register two users, e.g. `alice@test.com` and `bob@test.com`, each in its own
   browser; log both in.
2. **Alice** → `/dashboard/friends` → **Search** tab → type `bob` → **Add friend**.
   The request moves to Alice's **Sent** list.
3. **Bob** → `/dashboard/friends` → **Requests** tab → the incoming request from
   Alice appears → **Accept**.
4. Both now see each other under the **Friends** tab. Watch the network calls:
   `POST /api/friends/request`, `POST /api/friends/respond`, `GET /api/friends/list`.
5. **Remove:** either side → Friends tab → **Remove** → `DELETE /api/friends/[id]`;
   the pair disappears from both lists.

### 5a.2 Room invitations (invite a friend into a room)

1. With Alice & Bob already friends (§5a.1), **Alice** → `/create-room` → create a
   room. On the room page click **Invite friends** → the `InviteFriendsModal` lists
   Alice's friends → pick **Bob** → **Invite** (`POST /api/rooms/[id]/invite`).
2. **Bob** → `/invitations` (or the dashboard bell) → the pending invite shows
   (`GET /api/invitations`) → **Accept** → Bob is dropped straight into Alice's room.
3. Invites **expire** (`expiresAt` on `RoomInvitation`) — an expired invite is
   filtered out of the list, verifying the `gt: new Date()` guard.

### 5a.3 Voice chat (WebRTC mic test)

Voice auto‑joins when a game is ready (`FEATURE_VOICE_CHAT=true`, on by default;
`NEXT_PUBLIC_DISABLE_VOICE=true` hard‑offs it).

1. Start a game with ≥2 real browsers on the same machine (localhost is a **secure
   context**, so `getUserMedia` works without HTTPS). Allow mic access when prompted.
2. Each player renders a `PlayerVoiceBadge`; the **mic button** toggles mute
   (`toggleMute`). Speak in one window — the other player's badge should show
   speaking/active state.
3. On localhost/LAN, peers connect **host‑direct** (no TURN needed). To exercise the
   relay path, set `TURN_URL` + `TURN_SECRET` and confirm
   `GET /api/voice/turn-credentials` returns short‑lived `iceServers` (Feature 20).
4. Inspect the live peer connections at `chrome://webrtc-internals` (ICE candidate
   type `host` locally, `relay` when forced through TURN).

> **Cross‑device / real‑network voice needs HTTPS.** Browsers only grant the mic on
> `localhost` or a `https://` origin. To test between two machines, front the dev
> server with a TLS tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`)
> or the `setup-network-access.ps1` helper in the repo root, then open the https URL.

---

### Testing the Redis + BullMQ path (Mode 2)

The queue/hot‑cold features are **off by default**. To exercise them end‑to‑end:

```bash
# Terminal 1 — datastores
npm run test:db:start

# Terminal 2 — worker (consumes the BullMQ game-actions queue)
FEATURE_ACTION_QUEUE=true FEATURE_HOT_COLD_STATE=true \
REDIS_URL=redis://localhost:6380 \
DATABASE_URL=postgresql://test:test@localhost:5433/bridgeonline_test \
  npm run start:worker

# Terminal 3 — app with the flags on, then play a full game (UI or a spec)
FEATURE_ACTION_QUEUE=true FEATURE_HOT_COLD_STATE=true \
REDIS_URL=redis://localhost:6380 \
  npm run dev
```

Assert: the `/api/games/:id/play` response has `queued: true`; the game still
reaches `COMPLETED` (worker processed it); and re‑POSTing the same `actionId`
does not advance state twice (idempotency).

---

## 6. Generating & reading logs

> **See also:** [observability.md](./observability.md) — consolidated reference for logs, metrics, health, Sentry, and a one‑command local **Prometheus + Grafana** stack.

Logging is **Pino** (`lib/observability/logger.ts`).

- **Dev**: pretty, colorized, human output via `pino-pretty`
  (`NODE_ENV=development`). You'll see it inline in the `npm run dev` terminal.
- **Prod/test**: single‑line **JSON** to stdout (for Loki / CloudWatch / etc.).
- **Level**: `LOG_LEVEL=trace|debug|info|warn|error` (default `info`).
- **Secret redaction**: `passwordHash`, `password`, `TURN_SECRET`,
  `TURN_CREDENTIAL`, `credential` are auto‑`[Redacted]`.
- **Correlation IDs**: use `gameLogger(gameId, userId, requestId)` for a child
  logger so game actions can be traced across the request → queue → worker path.

```bash
# Verbose dev logs
LOG_LEVEL=debug npm run dev

# JSON logs (as prod emits), pretty-printed on demand:
NODE_ENV=production LOG_LEVEL=debug npm run start:all | npx pino-pretty

# Follow a single game across logs (JSON mode)
npm run start:all 2>&1 | grep '"gameId":"<id>"'
```

Errors are also forwarded to **Sentry** when `SENTRY_DSN` is set (no‑op locally
without it). Set `SENTRY_TRACES_SAMPLE_RATE=1.0` locally to see traces.

---

## 7. Tracing & performance

### Playwright traces (frontend / flow debugging)

```bash
# Capture a full trace (DOM snapshots, network, console) for every test
npx playwright test playing.spec.ts --trace on

# Open the trace viewer (time-travel through the run)
npx playwright show-trace test-results/**/trace.zip

# On failures the config already keeps: trace on-first-retry, video, screenshot
npx playwright show-report      # HTML report after a run
```

### Metrics — Prometheus (`GET /api/metrics`)

`prom-client` exposes (plus default Node process metrics):

| Metric | Type | Use |
|---|---|---|
| `http_requests_total` | counter | request volume by route/status |
| `http_request_duration_seconds` | histogram | **latency** (p50/p95/p99) |
| `socket_connections_active` | gauge | live players |
| `socket_rooms_active` | gauge | live tables |
| `bullmq_jobs_active` | gauge | worker throughput |
| `bullmq_jobs_depth` | gauge | **queue backlog** (watch this under load) |
| `games_completed_total` | counter | boards finished |

```bash
# Scrape once
curl -s localhost:3000/api/metrics | grep -E 'http_request_duration|bullmq_jobs_depth|socket_connections_active'
```

> `/api/metrics` is **unauthenticated** — in prod restrict it via
> `METRICS_ALLOWLIST_CIDR` / ingress allowlist. Point a local Prometheus +
> Grafana (docker) at it for dashboards.

### Health (`GET /api/health`)

```bash
curl -s localhost:3000/api/health | jq
# { "status":"ok", "db":"up", "redis":"up"|"n/a", "ts":"…" }   (503 = degraded)
```

### Database performance (Feature 19 indexes)

```bash
# Confirm the composite / GIN / covering indexes are used
npx prisma db execute --stdin <<'SQL'
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM games WHERE game_room_id = '<id>' AND phase <> 'COMPLETED';
SQL
# Expect: Index Scan using idx_games_room_phase  (not Seq Scan)
```

### Quick load check (latency under concurrency)

```bash
# hammer the metrics/health or an API route and watch p95 + queue depth
npx autocannon -c 50 -d 20 http://localhost:3000/api/health
# then re-scrape /api/metrics to read http_request_duration_seconds buckets
```

For realtime/socket load, run several `test:e2e` game specs in parallel (raise
`workers` in `playwright.config.ts`) and watch `socket_connections_active`,
`socket_rooms_active`, and `bullmq_jobs_depth`.

---

## 8. Manual 4‑player play‑test (four browser windows)

The automated e2e already drives four players; this is how to do it **by hand**
so you can watch a real game and correlate it with logs, health, and metrics.

### 8.1 Why four *different* browsers

Each player is a NextAuth session stored in a **cookie**. Two normal windows of
the *same* browser share cookies → same player. Use four **separate cookie
jars**:

| Player / seat | Use |
|---|---|
| North | Chrome (normal) |
| East | Firefox |
| South | Microsoft Edge |
| West | Chrome **Incognito** (or Brave, or a 2nd Chrome profile) |

### 8.2 Start the stack

**Option A — app on host, datastores in Docker (fastest):**
```bash
npm run test:db:start                 # Postgres :5433 + Redis :6380 in Docker
REDIS_URL=redis://localhost:6380 \
DATABASE_URL=postgresql://test:test@localhost:5433/bridgeonline_test \
FEATURE_RECONNECT_GRACE=true NEXT_PUBLIC_FEATURE_NEW_UI=true \
  npm run dev                         # app logs stream in THIS terminal
```

**Option B — everything in Docker (observe all logs/health in Docker Desktop):**
save this as `docker-compose.dev.yml`, then `docker compose -f docker-compose.dev.yml up --build`:
```yaml
services:
  db:    { image: postgres:16-alpine, environment: { POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: bridge }, ports: ["5432:5432"] }
  redis: { image: redis:7-alpine, ports: ["6379:6379"] }
  app:
    build: .                          # uses the production Dockerfile
    command: npm run start:all
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://app:app@db:5432/bridge
      REDIS_URL: redis://redis:6379
      NEXTAUTH_SECRET: dev-secret-change-me
      NEXTAUTH_URL: http://localhost:3000
      NEXT_PUBLIC_SOCKET_URL: http://localhost:3000
      FEATURE_RECONNECT_GRACE: "true"
    depends_on: [db, redis]
```
Now Docker Desktop's **Containers** view shows `app`, `db`, `redis` — each with a
**Logs** tab and a **Stats** tab (CPU/mem/net).

### 8.3 Drive the game

1. In **each** browser open `http://localhost:3000/register` and create a unique
   user (`north@test.com`, `east@…`, `south@…`, `west@…`) → then log in.
2. **North** → `/create-room`, set a name + *Number of Games* (e.g. 3) → **Create**.
   Copy the **invite code**.
3. **East/South/West** → `/join-room` → paste the code → **Join**.
4. Each player picks a seat (or accepts the auto‑assigned one) → **Ready**.
5. **North** → **Start**. Bidding begins — the player *on turn* bids/passes.
6. After 3 passes the auction closes → play 13 tricks (tap a card to select, tap
   again to confirm).
7. **Test reconnection:** in one window press **F5** (reload) mid‑game — you have
   a **30 s grace** to come back to your seat; watch the disconnect banner and
   the logs.
8. **Voice (optional):** with `FEATURE_VOICE_CHAT=true`, allow mic in each window;
   the four `PlayerVoiceBadge`s go live and `socket_connections_active` stays ~4.
   Toggle mute per seat (§5a.3).
9. **Leave:** click **Leave** in one window → `POST /api/games/:id/exit` frees that
   seat and the other three see the seat empty / disconnect banner.

> **Alternative to invite codes:** if the four accounts are already friends, the
> host can seat them via **Invite friends** → the invitees accept from
> `/invitations` instead of pasting a code (§5a.2).

### 8.4 Observe while playing (Docker)

```bash
docker ps                                        # container names + status
docker logs -f <app-container>                   # app logs (Option B)
docker compose -f docker-compose.dev.yml logs -f app     # or via compose
docker stats                                     # live CPU / mem / net per container (performance)

# App health & metrics (works in either option)
curl -s localhost:3000/api/health | jq           # {status:ok, db:up, redis:up|n/a}
curl -s localhost:3000/api/metrics | grep -E 'socket_connections_active|socket_rooms_active'
#   → socket_connections_active should read ~4 while the table is live

# Peek at Redis state during play
docker exec -it <redis-container> redis-cli
> KEYS game:*                                     # hot game-state / disconnect keys
> LLEN bull:game-actions:wait                     # BullMQ backlog (queue mode)
> exit

# Peek at Postgres
docker exec -it <db-container> psql -U test -d bridgeonline_test -c \
  "SELECT id, phase, board_number FROM games ORDER BY started_at DESC LIMIT 5;"
```

> **Docker Desktop GUI:** Containers → click `app` → **Logs** (search/filter) and
> **Stats**; click `redis` → **Exec** → run `redis-cli`.

### 8.5 Observe while playing (Kubernetes)

Local cluster options: **Docker Desktop's built‑in Kubernetes**, **k3d**, **kind**,
or **minikube**. Apply the manifests from [the local-Kubernetes guide](./kubernetes-local.md), then:

```bash
kubectl get pods,svc,ingress                      # what's running
kubectl port-forward svc/bridge 3000:80           # reach the app locally

# Logs (single or split-services topology)
kubectl logs -f deploy/bridge                     # all-in-one
kubectl logs -f -l app=bridge --all-containers --prefix   # every replica
kubectl logs -f deploy/bridge-web ; kubectl logs -f deploy/bridge-socket ; kubectl logs -f deploy/bridge-worker
stern bridge                                      # (if installed) tail all pods, colorized

# Health & probes
curl -s localhost:3000/api/health | jq
kubectl describe pod -l app=bridge | grep -A3 -E 'Liveness|Readiness'   # probe results
kubectl get events --sort-by=.lastTimestamp | tail

# Performance
kubectl top pods                                  # CPU/mem (needs metrics-server)
kubectl exec -it deploy/redis -- redis-cli LLEN bull:game-actions:wait   # queue depth

# Metrics → Prometheus/Grafana
kubectl port-forward svc/bridge 9090:80 && curl -s localhost:9090/api/metrics | head
```

Play the same 4‑browser flow against `http://localhost:3000` (via the
port‑forward) and watch `kubectl logs`, `kubectl top pods`, and `/api/metrics`
update live.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `npm install` ERESOLVE (bullmq/redis peer) | `npm install --legacy-peer-deps` |
| `.next/server/vendor-chunks/lib/worker.js not found` | a server‑only pkg got bundled — check `serverExternalPackages` in `next.config.ts`; `rm -rf .next` |
| `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` | server run with plain `node`; use **tsx** (`npm run dev`) |
| e2e `webServer was not able to start` | server crash — run `npm run dev` directly to see the real error |
| `port already allocated 5433/6380` | a DB/Redis already runs there; `docker ps` / `npm run test:db:stop` |
| Redis‑adapter / queue tests fail | `npm run test:db:start` (Redis on 6380 must be up); `REDIS_URL` set |
| Playwright `Executable doesn't exist` | `npx playwright install chromium` |
