# BridgeOnline — AWS Deployment (concrete)

> Companion to [the deployment guide](./README.md); assumes its tiers, image build (§2), and pre-flight checklist (§7).
>
> **Using AWS free credits for Redis / higher game TPS?** Start with the shorter guide:
> [aws-redis-credits.md](./aws-redis-credits.md) (Lightsail/EC2 + Redis, keep Supabase).
> Branch: **`AWSDep`** · env template: [`deploy/aws/env.aws.template`](../../deploy/aws/env.aws.template).

## 8. Deploying on AWS (concrete)

This section maps the provider‑agnostic tiers above onto **specific AWS services**.
The same hard rule applies: **>1 web/socket task requires `REDIS_URL`** (Feature 13
adapter). AWS's Application Load Balancer supports WebSockets natively and can pin a
client to one socket task with target‑group stickiness — so it's a clean fit.

### 8.1 App need → AWS service

| App need | AWS service | Notes |
|---|---|---|
| Compute (containers) | **ECS on Fargate** (recommended) or EC2/Lightsail | Fargate = no servers to patch; one task def per service (web/socket/worker) |
| Container images | **ECR** | Build with `NEXT_PUBLIC_*` **build args** (§2), push per release |
| PostgreSQL | **RDS for PostgreSQL** (or **Aurora Serverless v2**) | `DATABASE_URL` + `DIRECT_URL`; enable automated backups |
| Redis | **ElastiCache for Redis** (or **MemoryDB** for HA) | `REDIS_URL`; use `rediss://` when encryption‑in‑transit is on |
| Load balancer / TLS | **ALB** + **ACM** cert | WebSockets native; raise **idle timeout**; path‑route `/socket.io/*` |
| DNS | **Route 53** | A/ALIAS record → ALB |
| Runtime secrets | **Secrets Manager** or **SSM Parameter Store** | Injected as ECS task `secrets` (never baked into the image) |
| Logs | **CloudWatch Logs** (`awslogs` driver) | Pino already emits JSON to stdout in prod |
| Metrics | **Container Insights**, or **AMP + AMG** scraping `/api/metrics` | Lock `/api/metrics` to a security group / `METRICS_ALLOWLIST_CIDR` |
| Errors/traces | **Sentry** (`SENTRY_DSN`) | Unchanged from §6 |
| Voice relay (TURN) | **coturn on EC2** (+ Elastic IP) | Bandwidth‑driven (§4); open UDP 3478 + relay range |
| CI/CD | **GitHub Actions → ECR → ECS deploy** | `all-tests.yml` gates, then `aws ecs update-service` |
| Autoscaling | **ECS Service Auto Scaling** (Application Auto Scaling) | web/socket on CPU; worker on a custom `bullmq_jobs_depth` CloudWatch metric |

### 8.2 AWS tiers & rough cost (us‑east‑1, on‑demand)

| Tier | Shape | ~$/mo | Maps to |
|---|---|---|---|
| **A — single box** | 1× **Lightsail** / EC2 `t4g.small`, Docker Compose (app + Postgres + optional Redis), Caddy for TLS | **~$10–20** | Tier 0/1 |
| **B — managed small prod** | ECS Fargate (1 web+socket task, 0.5 vCPU/1 GB) · RDS `db.t4g.micro` · ElastiCache `cache.t4g.micro` · ALB | **~$55–90** | Tier 2 |
| **C — HA + split + voice** | ECS/EKS multi‑AZ (web/socket/worker services, ≥2 tasks each) · Multi‑AZ RDS · ElastiCache replication group · ALB · coturn EC2 · AMP/AMG | **~$200–450+** | Tier 3 |

> The **ALB alone is ~$16–22/mo** before traffic, which is why Tier A (no ALB, TLS
> terminated by Caddy on the box) is dramatically cheaper for a demo. Fargate's
> minimum billable task and RDS/ElastiCache floors set Tier B's baseline. **NAT
> Gateway (~$32/mo + data)** is the classic surprise line item — avoid it by placing
> tasks in public subnets with `assignPublicIp: ENABLED`, or by using VPC endpoints
> for ECR/Secrets/CloudWatch.

### 8.3 The AWS‑specific gotchas (get these right)

**ALB for Socket.io.** ALB speaks WebSockets with no special config, but:
- **Idle timeout:** default 60s will drop long‑lived sockets. Raise it
  (`aws elbv2 modify-load-balancer-attributes … idle_timeout.timeout_seconds=3600`)
  and rely on Socket.io ping/pong to keep it warm.
- **Sticky sessions:** enable **target‑group stickiness** on the *socket* target
  group so a client stays on one task through the upgrade handshake — this is the
  AWS equivalent of the k8s `affinity: cookie` annotation. Required **even with the
  Redis adapter** (adapter handles cross‑task broadcast, not the handshake).
- **Path routing:** one ALB, two target groups — listener rule `/socket.io/*` →
  **socket‑tg**, default `/*` → **web‑tg**. (Single‑service/all‑in‑one deploys skip
  this and point everything at one target group.)

**RDS + Prisma.** Set `DATABASE_URL` (pooled) and `DIRECT_URL` to the RDS endpoint;
run migrations as a **one‑off ECS task** (`npx prisma migrate deploy`) on each
release — the ECS analog of the k8s initContainer/Job. If you front RDS with **RDS
Proxy**, keep `DIRECT_URL` pointed at the raw instance so migrations bypass the pool.

**ElastiCache is VPC‑internal.** No public endpoint — your Fargate tasks must be in
the **same VPC** and a security group that allows 6379 from the task SG. Turn on
encryption‑in‑transit → use `rediss://`. This is the switch that unlocks
`replicas > 1`, hot/cold state (#17), and the BullMQ queue (#18).

**Secrets, not env in the task def.** Put `DATABASE_URL`, `NEXTAUTH_SECRET`,
`REDIS_URL`, `TURN_SECRET`, `SENTRY_DSN` in **Secrets Manager / SSM** and reference
them via the task definition's `secrets` block. Only `NEXT_PUBLIC_*` (build‑time)
and non‑secret config go in plain `environment`.

**`/api/metrics` exposure.** Do **not** route it through the public ALB. Scrape it
from AMP/a Prometheus task **inside the VPC**, or restrict with a security group /
`METRICS_ALLOWLIST_CIDR`. Same for the CORS origin on the socket server (lock to
your domain, not `*`).

**Voice/coturn.** Fargate can't host coturn well (it needs a wide UDP port range and
a stable public IP). Run **coturn on a small EC2** with an **Elastic IP**; open the
security group for **UDP/TCP 3478** and the **relay range** (e.g. UDP 49152–65535).
Point `TURN_URL` at the Elastic IP; keep `TURN_SECRET` in Secrets Manager. Egress
bandwidth is the cost driver (§4).

### 8.4 Fastest path to a running Tier B

```bash
# 0) One-time: repo + secrets
aws ecr create-repository --repository-name bridgeonline
aws secretsmanager create-secret --name bridge/prod --secret-string '{
  "DATABASE_URL":"postgresql://user:pass@<rds-endpoint>:5432/bridge",
  "NEXTAUTH_SECRET":"<openssl rand -base64 32>",
  "REDIS_URL":"rediss://<elasticache-endpoint>:6379",
  "SENTRY_DSN":""
}'

# 1) Build with NEXT_PUBLIC_* baked in, push to ECR
ACCT=$(aws sts get-caller-identity --query Account --output text); REGION=us-east-1
aws ecr get-login-password --region $REGION | docker login --username AWS \
  --password-stdin $ACCT.dkr.ecr.$REGION.amazonaws.com
docker build \
  --build-arg NEXT_PUBLIC_SOCKET_URL=https://play.example.com \
  --build-arg NEXT_PUBLIC_FEATURE_NEW_UI=true \
  -t $ACCT.dkr.ecr.$REGION.amazonaws.com/bridgeonline:latest .
docker push $ACCT.dkr.ecr.$REGION.amazonaws.com/bridgeonline:latest

# 2) Provision RDS + ElastiCache in your VPC (console or IaC), then run migrations
#    as a one-off Fargate task overriding the command:
#    npx prisma migrate deploy

# 3) ECS: cluster + service. Single all-in-one service is simplest:
#    task command = ["npm","run","start:all"], port 3000 → web-tg behind the ALB.
#    To split (Feature 19): 3 services from the SAME image, commands
#    start:web (→ web-tg), start:socket (→ socket-tg), start:worker (no LB).

# 4) ALB: HTTPS listener (ACM cert) → rule /socket.io/* = socket-tg, default = web-tg.
#    Raise idle timeout; enable stickiness on socket-tg. Route 53 A/ALIAS → ALB.
```

> **All‑in‑one vs split on AWS:** start with **one Fargate service** running
> `start:all` (Tier B) — simplest, and correct as long as you keep it at **1 task**
> until Redis is wired. Move to the **3‑service split** (Feature 19) only when you
> need to scale web, socket, and worker independently; that's when the socket‑tg
> stickiness + `/socket.io/*` path rule above become mandatory.

### 8.5 AWS pre‑flight (in addition to §7)

- [ ] Tasks and RDS/ElastiCache share a **VPC**; SGs allow 5432/6379 from the task SG.
- [ ] ALB **idle timeout raised** and **stickiness enabled on the socket target group**.
- [ ] Secrets via **Secrets Manager/SSM** `secrets:` — never in `environment:`.
- [ ] `prisma migrate deploy` runs as a **one‑off task** before the new revision serves.
- [ ] `assignPublicIp: ENABLED` (public subnets) **or** VPC endpoints — to avoid a
      NAT Gateway bill.
- [ ] `NEXT_PUBLIC_*` passed as **`--build-arg`** at `docker build`, matching the
      public domain (`NEXT_PUBLIC_SOCKET_URL`).
- [ ] `/api/metrics` **not** on the public ALB; CloudWatch log group created for the
      `awslogs` driver.
- [ ] coturn on **EC2 + Elastic IP** (not Fargate) if voice is enabled.
