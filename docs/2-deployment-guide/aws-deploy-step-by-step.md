# BridgeOnline — AWS deploy guide (what / how / why)

Branch: **`AWSDep`**. Stack: **`BridgeOnlineRedisVoice`** (`deploy/aws/cdk`).  
Diagram: [`../bridgeonline-aws-redis-voice.drawio`](../bridgeonline-aws-redis-voice.drawio).

This guide is the **friends-play** path (EC2 + Redis + coturn + keep Supabase).  
It includes what we learned deploying on a Free Tier / credits account in **`ap-south-1`**, including a **working console-launched 4 GB host**.

**Current live friends host (Aug 2026):** EC2 `i-0ced4339575fd037c` · public IP **`13.127.122.215`** · Amazon Linux 2023 **`x86_64`** · Redis6 on-box · Caddy → `:3000` · coturn in Docker · app via pm2 on branch `AWSDep`.

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
| **SSH key (.pem)** | Key pair file for `ssh -i … ec2-user@IP` | Works when SSM is flaky; never commit the `.pem` |
| **Security group** | Instance firewall in AWS | App can be healthy on localhost and still unreachable until **TCP 80** (and TURN ports) are open |
| **Caddy arch** | Binary must match `uname -m` (`amd64` vs `arm64`) | Wrong arch → `cannot execute binary file: Exec format error` |
| **redis6 / redis6-cli** | Amazon Linux Redis 6 package | On-box Redis when ElastiCache isn’t wired to this VPC |

---

## Target architecture

### Working path (what is live now)

```
Players (browser)
    │  HTTP/WSS :80  (+ TURN UDP 3478)
    ▼
Public IP → EC2 x86_64 4GB (Caddy → Node start:all; coturn Docker; redis6 localhost)
    │
    └── Prisma → Supabase Postgres (aws-1 pooler)
```

**What:** One always-on 4 GB game server with Redis and TURN on the same box.  
**How:** Launch EC2 in Console (or CDK when allowed) → SSH with `.pem` → install packages → clone `AWSDep` → pm2 + Caddy.  
**Why:** Avoids Free Tier CDK blocks and ElastiCache VPC coupling; 4 GB avoids OOM during builds.

### Optional CDK path (ElastiCache)

```
Elastic IP → EC2 → ElastiCache Redis (same VPC) → Supabase
```

Use when paid EC2 types work via API and you want managed Redis.

---

## Monthly cost estimate

Prices are approximate **ap-south-1 (Mumbai)**, on-demand, **always-on**, friends-play load. Confirm the exact instance type in the EC2 console.

### C — Current live host (4 GB console EC2 + Redis on-box) ← **you are here**

Assumes a typical **4 GB** general-purpose type in Mumbai (e.g. **t3.medium** / **t3a.medium** — check the Instance type column for `i-0ced4339575fd037c`).

| Piece | ~$/mo | Notes |
|-------|------:|-------|
| EC2 **4 GB** (x86_64) | **28–35** | Dominant cost |
| EBS root (8–30 GB gp3) | 1–3 | Depends on volume size |
| Redis on-box (`redis6`) | 0 | No ElastiCache bill |
| Elastic IP (if attached) | 0 | Free while associated |
| coturn / HTTP egress | 1–15+ | Rises with voice relay |
| Supabase | 0–25 | Outside AWS (your existing plan) |
| **Estimated AWS total (idle 24/7)** | **~$30–40 / month** | |
| **With light voice + traffic** | **~$35–55 / month** | |

**Against $200 credits:** about **4–6 months** at this footprint if the instance runs continuously and egress stays modest.

**Save money:** stop the instance when not playing — you still pay EBS (~$1–3/mo) but not compute hours.

### A — Earlier CDK path (`t4g.small` 2 GB + ElastiCache)

| Total idle | ~**$27–35/mo** |

### B — CDK `t4g.medium` + ElastiCache (when API allows)

| Total idle | ~**$39–50/mo** |

### Lesson: credits vs Free Tier

| What | How | Why |
|------|-----|-----|
| Account shows $200 credits | Billing → Credits | Pays for compute/egress |
| CDK `t4g.medium` CREATE blocked | EC2 API Free Tier rule | Credits ≠ Free Tier eligibility |
| Console launched a 4 GB type | Manual Launch + SSH | Path that worked for the live host |

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
| 11 | Paste glued commands (`caddycd`) | One command per line in SSH/SSM | Paste is fragile |
| 12 | Caddy `Exec format error` | Download `arch=amd64` when `uname -m` is `x86_64` (not `arm64`) | Binary arch must match CPU |
| 13 | Health OK on localhost, browser can’t reach host | Open SG **TCP 80** (and 3000/3478 as needed) | Security group ≠ local listen |
| 14 | New 4 GB box in default VPC | Use **redis6 on-box** (`REDIS_URL=redis://127.0.0.1:6379`) | Old ElastiCache is VPC-local; don’t assume reachability |
| 15 | SSM flaky | SSH with `.pem` as `ec2-user@PUBLIC_IP` | Reliable day-2 access |

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
| Health | `curl http://13.127.122.215/api/health` (or current public IP) |
| App logs | `pm2 logs bridgeonline` |
| SSH | `ssh -i BridgeSSH.pem ec2-user@PUBLIC_IP` |
| Stop spend (keep disk) | EC2 → Stop instance |
| Tear down CDK stack (if any) | `npx cdk destroy BridgeOnlineRedisVoice` |
| Console empty? | Region **ap-south-1 (Mumbai)** |

---

## Phase 9 — Console EC2 playbook (what worked for the live 4 GB host)

| | |
|--|--|
| **What** | Manual Amazon Linux 2023 host with Redis + Caddy + coturn + pm2 |
| **How** | Launch 4 GB instance → attach key pair → open SG ports → SSH → install → clone `AWSDep` |
| **Why** | Bypassed CDK Free Tier instance-type blocks; 4 GB avoids build OOMs |

### Access

```powershell
ssh -i "PATH\TO\your-key.pem" ec2-user@PUBLIC_IP
sudo -i
```

### Packages (x86_64 example)

```bash
dnf install -y docker git jq redis6
systemctl enable --now docker redis6
redis6-cli ping   # PONG

# Caddy — MATCH CPU ARCH
# uname -m = x86_64  → arch=amd64
# uname -m = aarch64 → arch=arm64
curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=amd64" -o /usr/local/bin/caddy
chmod +x /usr/local/bin/caddy
```

Caddyfile reverse_proxy `:80` → `127.0.0.1:3000`. systemd enable caddy.

coturn via Docker with `--external-ip=PUBLIC_IP` and `TURN_SECRET` matching `.env`.

App:

```bash
cd /opt && git clone … bridgeonline && cd bridgeonline && git checkout AWSDep
# .env: REDIS_URL=redis://127.0.0.1:6379  NEXTAUTH_URL=http://PUBLIC_IP
npm ci --legacy-peer-deps && npx prisma generate && npm run build
pm2 start npm --name bridgeonline -- run start:all
pm2 save && pm2 startup systemd -u root --hp /root
```

### Security group (required or browser “can’t reach”)

| Port | Protocol | Why |
|------|----------|-----|
| 22 | TCP | SSH |
| 80 | TCP | Caddy / HTTP |
| 443 | TCP | HTTPS later |
| 3478 | TCP+UDP | TURN |
| 49152–49200 | UDP | TURN relay |

### Verify

```bash
curl -s http://127.0.0.1:3000/api/health   # on box
curl -s http://127.0.0.1/api/health        # via Caddy
# from laptop:
curl.exe -s http://PUBLIC_IP/api/health
```

---

## Related docs

| Doc | Role |
|-----|------|
| [`aws-redis-credits.md`](./aws-redis-credits.md) | Credits / Redis options without full CDK |
| [`aws.md`](./aws.md) | Larger ECS/ALB/RDS map |
| [`deploy/aws/README.md`](../../deploy/aws/README.md) | Asset index |
| [`deploy/aws/cdk/README.md`](../../deploy/aws/cdk/README.md) | CDK quick reference |
| [`deploy/aws/env.aws.template`](../../deploy/aws/env.aws.template) | Env template |
