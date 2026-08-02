# BridgeOnline — AWS deploy guide (what / how / why)

Branch: **`AWSDep`**. Stack: **`BridgeOnlineRedisVoice`** (`deploy/aws/cdk`).  
Diagram: [`../bridgeonline-aws-redis-voice.drawio`](../bridgeonline-aws-redis-voice.drawio).

This guide is the **friends-play** path (EC2 + ElastiCache Redis + coturn + keep Supabase).  
It includes what we learned deploying on a Free Tier / credits account in **`ap-south-1`**.

---

## Glossary (software & AWS terms)

| Term | What it is | Why we use it |
|------|------------|---------------|
| **EC2** | Virtual server in AWS | Always-on host for Next.js + Socket.io (Render free sleeps) |
| **t4g.small / t4g.medium** | ARM instance sizes (~2 GB / ~4 GB RAM) | Cheap Graviton; small is often Free Tier–eligible, medium is paid |
| **Free Tier–eligible** | Instance types AWS allows on restricted/new Free Tier accounts | **Credits ≠ eligibility** — API can block `t4g.medium` even with $200 credits |
| **Elastic IP (EIP)** | Stable public IPv4 | Friends bookmark one IP; TURN needs a fixed host |
| **VPC / security group** | Private network + firewall rules | Redis stays private; open 80/443/3478 only as needed |
| **ElastiCache Redis** | Managed Redis in the VPC | Socket.io adapter, reconnect grace; no public endpoint |
| **Secrets Manager** | Encrypted secret store | DB URL, `NEXTAUTH_SECRET`, `TURN_SECRET` (not in git) |
| **CDK** | AWS Cloud Development Kit (TypeScript → CloudFormation) | Infra as code: VPC, EC2, Redis, secrets, outputs |
| **CloudFormation** | AWS’s stack engine CDK drives | Creates/updates/destroys resources as one unit |
| **SSM Session Manager** | Browser/CLI shell into EC2 without opening SSH | Safer than port 22 to the world |
| **Session Manager plugin** | Local binary AWS CLI needs for `start-session` | Without it: “SessionManagerPlugin is not found” |
| **pm2** | Process manager for Node | Restarts `npm run start:all` after crash/reboot |
| **Caddy** | Reverse proxy + optional HTTPS | Listens on :80/:443, forwards to app :3000; WebSockets OK |
| **Docker** | Container runtime | Easy way to run **coturn** when the distro has no package |
| **coturn** | TURN/STUN server | Relays WebRTC voice when peers can’t connect P2P |
| **Supabase** | Hosted Postgres (already used on Render) | Avoid RDS cost; use **`aws-1-…` pooler** for this project |
| **Secure context** | HTTPS or `localhost` in the browser | Required for `getUserMedia` and often `crypto.randomUUID` |
| **Swap file** | Disk used as overflow RAM | Stops hard OOM kills on 2 GB boxes during `npm run build` |

---

## Target architecture (current design)

```
Players (browser)
    │  HTTP/WSS :80  (+ TURN UDP 3478)
    ▼
Elastic IP → EC2 (Caddy → Node start:all; coturn in Docker)
    │              │
    │              ├── REDIS_URL → ElastiCache (same VPC)
    │              └── secrets → Secrets Manager / .env
    └── Prisma → Supabase Postgres (pooler)
```

**What:** One always-on game server + Redis + optional voice relay.  
**How:** CDK provisions network/Redis/EC2; you install app on the box.  
**Why:** Higher Socket.io reliability than sleeping free Render; Redis unlocks adapter + reconnect; coturn unlocks cross-network voice.

---

## Monthly cost (what we actually run)

Prices are approximate **ap-south-1**, on-demand, idle friends-play load.

### A — What worked on this account (`t4g.small` + swap)

| Piece | ~$/mo | Notes |
|-------|------:|-------|
| EC2 **t4g.small** (2 GB) | 12–15 | Free Tier–eligible on many new accounts |
| EBS 30 GB gp3 | 2–3 | Root disk |
| ElastiCache **cache.t4g.micro** | 12–16 | Skip and use Redis on-box to save ~$12 |
| Elastic IP (attached) | 0 | Charged if unattached |
| Secrets Manager (1 secret) | ~0.40 | |
| TURN / HTTP egress | 1–20+ | Usage-dependent |
| **Total (idle)** | **~27–35** | Fits $200 credits for months |

### B — Desired if account allows paid EC2 (`t4g.medium`)

| Piece | ~$/mo |
|-------|------:|
| EC2 **t4g.medium** (4 GB) | 24–30 |
| Same Redis + disk + secrets | ~15–20 |
| **Total (idle)** | **~39–50** |

### Lesson: credits vs Free Tier

| What | How | Why |
|------|-----|-----|
| Account shows $200 credits | Billing → Credits | Money can pay for Redis, data transfer, etc. |
| `t4g.medium` CREATE fails with “not eligible for Free Tier” | EC2 API / CDK | Account still restricted to Free Tier–eligible types until billing/identity fully unlocks paid EC2 |
| Console lists 4 GB types | UI catalog | Listing ≠ permission to launch; try Launch — same error often appears |

**Unlock path (next session):** Billing payment method + identity verification → confirm Console can **Launch** `t4g.medium` → then CDK `AppHostMedium` deploy.

---

## Lessons learned (this deploy)

| # | What happened | How we fixed / mitigated | Why it mattered |
|---|----------------|---------------------------|-----------------|
| 1 | SG description with em dash failed create | ASCII `-` only in descriptions | EC2 rejects non-ASCII in `GroupDescription` |
| 2 | User-data didn’t install coturn/Docker | Manual `dnf` + Docker coturn | Don’t assume first-boot scripts finished |
| 3 | `npm run build` OOMed 2 GB box; SSM disconnected | Stop pm2/coturn before build; add **2 GB swap**; reboot for SSM | SSM agent dies under memory pressure |
| 4 | Console “no instances” | Wrong region (need **Mumbai `ap-south-1`**) | Resources are regional |
| 5 | In-place resize small→medium blocked | Stop→change type in Console, or replace instance / unlock paid tier | Some accounts block modify-instance-attribute |
| 6 | CDK `t4g.medium` CREATE: Free Tier ineligible | Stay on `t4g.small`+swap until account unlocked | Credits don’t override Free Tier eligibility |
| 7 | Voice: `mediaDevices.getUserMedia` undefined | Guard + skip auto-join unless `isSecureContext` | Mic API needs HTTPS (not `http://EIP`) |
| 8 | Bid: `crypto.randomUUID` not a function | `lib/uuid.ts` → `newActionId()` | Same secure-context limit on HTTP |
| 9 | Next build typed `deploy/aws/cdk` | `exclude: ["deploy/aws/cdk"]` in `tsconfig.json` | App build mustn’t require `aws-cdk-lib` |
| 10 | PowerShell `&` in secrets JSON | Single-quoted `--secret-string '...'` | `&` is a PowerShell operator |
| 11 | Paste glued commands (`caddycd`) | One command per line in SSM | SSM paste is fragile |

App fixes for HTTP live on **`AWSDep`** (`newActionId`, voice guards). Voice still needs **HTTPS + domain** for real mics.

---

## Phase 0 — Laptop tools

### 0.1 Node.js 22

| | |
|--|--|
| **What** | JavaScript runtime to run CDK and (optionally) local builds |
| **How** | Install LTS 22 from nodejs.org; `node -v` |
| **Why** | CDK app and BridgeOnline expect Node 22 |

### 0.2 Git

| | |
|--|--|
| **What** | Source control client |
| **How** | `git --version`; clone/pull `AWSDep` |
| **Why** | Deploy code and CDK live in the repo |

### 0.3 AWS CLI v2 + credentials

| | |
|--|--|
| **What** | Official CLI for EC2, CloudFormation, Secrets, SSM |
| **How** | Install CLI → `aws configure` → region `ap-south-1` → `aws sts get-caller-identity` |
| **Why** | CDK and day-2 ops need it; prefer IAM user over long-lived root keys |

### 0.4 Session Manager plugin

| | |
|--|--|
| **What** | Plugin for `aws ssm start-session` |
| **How** | [Install plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html); new terminal; `session-manager-plugin` |
| **Why** | Shell into EC2 without opening SSH to `0.0.0.0/0` |

---

## Phase 1 — Code on laptop

| | |
|--|--|
| **What** | Branch with CDK + env template + HTTP-safe game fixes |
| **How** | `git checkout AWSDep && git pull` |
| **Why** | Render branch ≠ AWS Redis/voice path |

```powershell
cd D:\dev\BridgeOnlineNEXTJS
git fetch origin
git checkout AWSDep
git pull origin AWSDep
```

---

## Phase 2 — CDK bootstrap (once per account/region)

| | |
|--|--|
| **What** | S3 + IAM roles CloudFormation needs to deploy CDK apps |
| **How** | `cd deploy\aws\cdk` → `npm install` → `npx cdk bootstrap aws://ACCOUNT/ap-south-1` |
| **Why** | Without bootstrap, `cdk deploy` cannot publish assets |

Ignore noisy deprecation warnings if bootstrap ends with success.

---

## Phase 3 — Deploy infrastructure

| | |
|--|--|
| **What** | VPC, security groups, ElastiCache, Secrets, EC2, Elastic IP |
| **How** | `npx cdk deploy BridgeOnlineRedisVoice` → approve → copy **Outputs** |
| **Why** | Automates networking + Redis that cannot be public |

**Current code intent:** construct `AppHostMedium` (`t4g.medium`).  
**If CREATE fails Free Tier:** use **`t4g.small`** until the account can launch paid types, then destroy/redeploy.

```powershell
cd D:\dev\BridgeOnlineNEXTJS\deploy\aws\cdk
npm install
npx cdk deploy BridgeOnlineRedisVoice
```

Save outputs: `ElasticIp`, `InstanceId`, `RedisPrimaryEndpoint`, `SuggestedTurnUrl`, `SecretArn`.

**ASCII rule:** security group descriptions must be plain ASCII (no Unicode dashes).

**Destroy / recreate:**

```powershell
npx cdk destroy BridgeOnlineRedisVoice
npx cdk deploy BridgeOnlineRedisVoice
```

---

## Phase 4 — Secrets Manager

| | |
|--|--|
| **What** | `bridgeonline/app` JSON: `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `TURN_SECRET` |
| **How** | Generate secrets → `put-secret-value` with **single-quoted** JSON on PowerShell |
| **Why** | Keeps passwords out of git; EC2/IAM can read later |

```powershell
openssl rand -base64 32
openssl rand -hex 32
```

```powershell
aws secretsmanager put-secret-value --region ap-south-1 --secret-id bridgeonline/app --secret-string '{"DATABASE_URL":"postgresql://postgres.PROJECT:PASSWORD@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1","DIRECT_URL":"postgresql://postgres.PROJECT:PASSWORD@aws-1-ap-south-1.pooler.supabase.com:5432/postgres","NEXTAUTH_SECRET":"...","TURN_SECRET":"..."}'
```

**Why `aws-1` not `aws-0`:** this Supabase project’s pooler is on **`aws-1-ap-south-1`**; wrong host → tenant not found.

---

## Phase 5 — Log into EC2 (SSM)

| | |
|--|--|
| **What** | Interactive shell on the instance |
| **How** | `aws ssm start-session --target i-… --region ap-south-1` then `sudo -i` |
| **Why** | Install runtime, clone app, manage pm2/Caddy |

If **`TargetNotConnected` / `ConnectionLost`:**

1. Confirm region `ap-south-1` and instance `running`
2. `aws ec2 reboot-instances --instance-ids i-…`
3. Wait until Ping = **Online**
4. Retry session

---

## Phase 6 — Host packages (manual; don’t trust user-data alone)

| | |
|--|--|
| **What** | Docker, git, Node 22, pm2, Caddy, optional swap, coturn container |
| **How** | `dnf install`, Nodesource, Caddy binary, `docker run coturn`, swapfile |
| **Why** | User-data often incomplete; these are the moving parts of the game host |

**Swap (strongly recommended on 2 GB):**

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**coturn (Docker example):**

```bash
docker run -d --name coturn --restart unless-stopped --network host \
  coturn/coturn -n --log-file=stdout \
  --external-ip=YOUR_EIP \
  --use-auth-secret --static-auth-secret=YOUR_TURN_SECRET \
  --realm=bridgeonline --listening-port=3478 \
  --min-port=49152 --max-port=49200
```

**Caddy:** reverse_proxy `:80` → `127.0.0.1:3000` (systemd unit). Enable `caddy` + `amazon-ssm-agent` + `pm2 startup`.

Helper stub: [`deploy/aws/setup-fresh-host.sh`](../../deploy/aws/setup-fresh-host.sh).

---

## Phase 7 — App on the box

| | |
|--|--|
| **What** | BridgeOnline production process (`start:all`) |
| **How** | Clone `AWSDep` → `.env` from template → `npm ci` → `prisma generate` → `build` → `pm2` |
| **Why** | Same all-in-one server as Render, with Redis + TURN env |

**Build rule on small instances:**

```bash
pm2 stop bridgeonline
docker stop coturn
cd /opt/bridgeonline
git pull origin AWSDep
npm run build
docker start coturn
systemctl start caddy
pm2 start bridgeonline
pm2 save
```

**`.env` essentials:** `NEXTAUTH_URL`, Supabase URLs, `REDIS_URL`, voice/`TURN_*` flags.

```bash
curl -s http://127.0.0.1/api/health
# expect db:up redis:up
```

---

## Phase 8 — HTTPS & voice (next session)

| | |
|--|--|
| **What** | TLS so browsers treat the site as a secure context |
| **How** | DNS A record → EIP; Caddy site block with domain (Let’s Encrypt) |
| **Why** | Mic and reliable WebRTC need HTTPS; HTTP on a public IP keeps voice off by design |

Until then: gameplay + Redis work; voice auto-join is skipped on non-secure contexts (code on `AWSDep`).

---

## Day-2 ops cheat sheet

| Task | Command / action |
|------|------------------|
| Health | `curl http://EIP/api/health` |
| App logs | `pm2 logs bridgeonline` |
| SSM status | `aws ssm describe-instance-information --filters Key=InstanceIds,Values=i-…` |
| Reboot (SSM dead) | `aws ec2 reboot-instances --instance-ids i-…` |
| Tear down spend | `npx cdk destroy BridgeOnlineRedisVoice` |
| Console empty? | Switch region to **ap-south-1 (Mumbai)** |

---

## Recommended path for next deploy

1. Unlock paid EC2 (billing/verification) **or** accept `t4g.small` + swap.
2. `cdk destroy` if the stack is half-broken → set a launchable instance type → `cdk deploy`.
3. Manual host setup (Phases 6–7), **one command per line**.
4. Confirm health + play a hand.
5. Add domain + HTTPS before relying on voice.

---

## Related docs

| Doc | Role |
|-----|------|
| [`aws-redis-credits.md`](./aws-redis-credits.md) | Credits / Redis options without full CDK |
| [`aws.md`](./aws.md) | Larger ECS/ALB/RDS map |
| [`deploy/aws/README.md`](../../deploy/aws/README.md) | Asset index |
| [`deploy/aws/cdk/README.md`](../../deploy/aws/cdk/README.md) | CDK quick reference |
| [`deploy/aws/env.aws.template`](../../deploy/aws/env.aws.template) | Env template |
