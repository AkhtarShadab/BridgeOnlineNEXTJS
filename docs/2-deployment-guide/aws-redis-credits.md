# AWS Credits Quickstart — Redis for higher game TPS

> Companion to [aws.md](./aws.md) and the [deployment guide](./README.md).
> Goal: use **AWS free-tier / $200 credits** to add a small Redis for BridgeOnline
> so realtime play stays snappy (reconnect, pub/sub, optional queue) without a
> full multi-AZ production bill.

## Why Redis (for a card game)

BridgeOnline keeps Socket.io rooms **in process** when `REDIS_URL` is unset.
That is fine on a **single** Render free instance, but:

| Without Redis | With `REDIS_URL` set |
|---|---|
| One replica only | Socket.io **Redis adapter** (Feature 13/16) — safe to scale later |
| Reconnect grace = in-memory Map | Reconnect grace = **Redis TTL** (survives restarts) |
| Every bid/play hits Postgres hot path | Optional **hot/cold** state in Redis (Feature 17) |
| Inline API actions | Optional **BullMQ** durable queue (Feature 18) |

For “friends game but higher TPS / fewer dropped sockets,” start with:

1. **One always-on compute box** (not sleeping free Render)
2. **Small Redis** next to it
3. Keep **Supabase Postgres** (already working) **or** move to RDS later

You do **not** need multi-AZ ElastiCache on day one.

---

## Recommended credit burn (Tier A+)

Cheapest path that feels like a real game host:

| Piece | AWS choice | Notes |
|---|---|---|
| App | **Lightsail** `$10` Node/Ubuntu **or** EC2 `t4g.small` | Run `npm run start:all` (or Docker) |
| Redis | **ElastiCache** `cache.t4g.micro` **or Redis on the same box** | Same-box Redis ≈ $0 extra compute |
| Postgres | Keep **Supabase** (current) | Avoid RDS cost until you outgrow it |
| TLS | Lightsail HTTPS / Caddy + Let’s Encrypt | Skip ALB (~$16+/mo) for now |

Rough burn with credits: **~$10–25/mo** until you add ALB/RDS.

When you outgrow this, graduate to [aws.md](./aws.md) Tier B (ECS + RDS + ElastiCache + ALB).

---

## Architecture (this branch)

```
Internet
   │
   ▼
Lightsail / EC2  ── npm run start:all  (Next + Socket.io, one process)
   │                    │
   │                    ├── REDIS_URL ──► ElastiCache (or local redis)
   │                    │
   └── DATABASE_URL ──► Supabase pooler (aws-1-… for this project)
```

**Hard rules (already in the product):**

- `REDIS_URL` set → Socket.io Redis adapter turns on automatically (`lib/redis.ts`)
- Replicas > 1 **require** Redis (+ sticky sessions at the LB)
- `FEATURE_ACTION_QUEUE=true` also needs a **worker** (`npm run start:worker`)
- Free Render sleeps; AWS Lightsail/EC2 does **not** — better for live tables

---

## Env template

See [`deploy/aws/env.aws.template`](../../deploy/aws/env.aws.template).

Minimum for Redis-backed single instance:

```bash
REDIS_URL=redis://<elasticache-or-localhost>:6379
# If ElastiCache encryption-in-transit: rediss://...

FEATURE_RECONNECT_GRACE=true
NEXT_PUBLIC_FEATURE_RECONNECT_GRACE=true

# Optional next steps (need Redis):
# FEATURE_HOT_COLD_STATE=true
# FEATURE_ACTION_QUEUE=true   # also run start:worker
```

Keep Supabase URLs as on Render (pooler **`aws-1-ap-south-1`** for project `zxglihcentjhwwxqkprb`).

---

## Option 1 — Redis on the same Lightsail/EC2 (fastest)

```bash
# Ubuntu
sudo apt update && sudo apt install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping   # PONG

# App .env
REDIS_URL=redis://127.0.0.1:6379
```

Bind Redis to localhost only (default). Do **not** expose 6379 to the internet.

Then:

```bash
git checkout AWSDep
npm ci --legacy-peer-deps
npx prisma generate
npm run build
NODE_ENV=production npm run start:all
```

Use **systemd** or **pm2** so the process restarts. Put Caddy/nginx in front for HTTPS and WebSockets.

### Checklist

- [ ] `REDIS_URL` set; `/api/health` shows `"redis":"up"`
- [ ] Logs: `[Socket.io] Redis adapter enabled`
- [ ] `FEATURE_RECONNECT_GRACE=true` — reload mid-hand restores seat within 30s
- [ ] `NEXTAUTH_URL` = your public HTTPS URL; `AUTH_TRUST_HOST=true`

---

## Option 2 — ElastiCache micro (managed Redis)

1. Create VPC (or use default) + security group: allow **6379** from the app instance SG only.
2. Create ElastiCache Redis **`cache.t4g.micro`**, single node, same VPC/subnet group as the app.
3. Encryption in transit off for simplicity → `REDIS_URL=redis://<primary-endpoint>:6379`  
   If on → `rediss://…` and ensure the Node Redis client trusts the cert path (or use AWS-recommended settings).
4. App instance in same VPC; set `REDIS_URL`; redeploy.

**Gotcha:** ElastiCache has **no public endpoint**. App must be on AWS in that VPC (not Render).

---

## Option 3 — Later: ECS + ElastiCache (see aws.md Tier B)

Use when you want multiple tasks / ALB. Then Redis is **mandatory** for Socket.io across tasks. Follow [aws.md](./aws.md) §8.4 and [service-separation.md](./service-separation.md).

---

## What Redis does **not** replace

- **CPU for Next.js SSR / card animations** — still need enough vCPU on the app box
- **Voice TURN** — still coturn / third party if you need reliable voice
- **Postgres** — Redis is not the source of truth; Prisma still needs `DATABASE_URL`

---

## Verify

```bash
curl -s https://YOUR_HOST/api/health
# expect: {"status":"ok","db":"up","redis":"up",...}
```

Play a hand with two browsers; kill one tab and rejoin within 30s with reconnect grace on.

---

## Branch

Work for this path lives on **`AWSDep`**. Merge to `master` when the AWS env is stable.
