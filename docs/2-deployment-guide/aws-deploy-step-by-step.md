# BridgeOnline — Step-by-step AWS deploy (Redis + voice)

Branch: **`AWSDep`**. Target stack: **`BridgeOnlineRedisVoice`** in `deploy/aws/cdk`.

What you get:

- Always-on **EC2** (Next.js + Socket.io)
- **ElastiCache Redis** (higher realtime TPS / reconnect)
- **coturn** on the same EC2 (table voice across networks)
- Existing **Supabase Postgres** (no new RDS bill)

Rough cost: **~$27–35/mo** idle (+ TURN bandwidth). Fits $200 AWS credits.

Architecture diagram: [`../bridgeonline-aws-redis-voice.drawio`](../bridgeonline-aws-redis-voice.drawio).

---

## Before you start (checklist)

| Need | Notes |
|------|--------|
| AWS account with credits / billing enabled | Prefer region **`ap-south-1`** (near your Supabase pooler) |
| Windows / Mac / Linux laptop | Commands below use PowerShell-friendly forms where noted |
| GitHub access to this repo | Branch `AWSDep` |
| Supabase DB password | Same one used on Render |
| A domain (optional but recommended) | e.g. `play.yourdomain.com` → Elastic IP. Without a domain you can use `https://<EIP>` with a self-signed cert or Caddy IP mode (awkward for friends). |

---

## Phase 0 — Install tools on your laptop

### 0.1 Node.js 22+

Install from [nodejs.org](https://nodejs.org/) (LTS 22). Check:

```powershell
node -v   # v22.x
npm -v
```

### 0.2 Git

```powershell
git --version
```

### 0.3 AWS CLI v2 (required)

1. Download: [AWS CLI v2 for Windows](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
2. Install, then **open a new terminal**.
3. Create an IAM user (or use IAM Identity Center) with Admin-ish rights for first deploy (or at least: EC2, VPC, ElastiCache, Secrets Manager, CloudFormation, IAM, SSM).
4. Create access keys and run:

```powershell
aws configure
```

Enter:

- **Access Key ID** / **Secret Access Key**
- **Default region**: `ap-south-1`
- **Output**: `json`

Verify:

```powershell
aws sts get-caller-identity
```

You should see your `Account` and `Arn`. Note the **Account** number (12 digits).

### 0.4 Session Manager plugin (recommended for SSH-less login)

Install the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) so you can open a shell on EC2 without opening SSH to the world.

---

## Phase 1 — Get the code

```powershell
cd D:\dev\BridgeOnlineNEXTJS
git fetch origin
git checkout AWSDep
git pull origin AWSDep
```

Confirm the CDK folder exists:

```powershell
dir deploy\aws\cdk
```

---

## Phase 2 — Bootstrap CDK (once per account + region)

CDK needs an S3 bucket / roles in the account. Run **once**:

```powershell
cd D:\dev\BridgeOnlineNEXTJS\deploy\aws\cdk
npm install

# Replace ACCOUNT with the 12-digit id from get-caller-identity
npx cdk bootstrap aws://ACCOUNT/ap-south-1
```

Wait until it finishes successfully.

---

## Phase 3 — Deploy the infrastructure

```powershell
cd D:\dev\BridgeOnlineNEXTJS\deploy\aws\cdk
npx cdk deploy BridgeOnlineRedisVoice
```

- Review the changeset; type **`y`** when asked.
- Takes ~10–20 minutes (ElastiCache is slow to create).

When done, CDK prints **Outputs**. Copy them somewhere safe:

| Output | Use for |
|--------|---------|
| `ElasticIp` | Your public IP / DNS A record / TURN host |
| `RedisPrimaryEndpoint` | `REDIS_URL=redis://<this>:6379` |
| `SecretArn` | Update secrets in console/CLI |
| `InstanceId` | SSM session |
| `SuggestedTurnUrl` | `TURN_URL` value |

You can also re-list outputs later:

```powershell
aws cloudformation describe-stacks --stack-name BridgeOnlineRedisVoice --query "Stacks[0].Outputs" --region ap-south-1
```

---

## Phase 4 — Fill Secrets Manager

Generate secrets on your laptop:

```powershell
# NextAuth secret
openssl rand -base64 32

# TURN secret (long random string is fine)
openssl rand -hex 32
```

Update the secret `bridgeonline/app` (Console → Secrets Manager → `bridgeonline/app` → Retrieve secret value → Edit), **or** CLI:

```powershell
aws secretsmanager put-secret-value --region ap-south-1 --secret-id bridgeonline/app --secret-string "{
  \"DATABASE_URL\": \"postgresql://postgres.zxglihcentjhwwxqkprb:YOUR_DB_PASSWORD@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1\",
  \"DIRECT_URL\": \"postgresql://postgres.zxglihcentjhwwxqkprb:YOUR_DB_PASSWORD@aws-1-ap-south-1.pooler.supabase.com:5432/postgres\",
  \"NEXTAUTH_SECRET\": \"PASTE_OPENSSL_VALUE\",
  \"TURN_SECRET\": \"PASTE_TURN_SECRET\"
}"
```

**Important:** pooler host must stay **`aws-1-ap-south-1`** for this project (not `aws-0`).

---

## Phase 5 — Lock SSH (optional but recommended)

In EC2 Console → Security Groups for the app:

- Prefer **remove** inbound TCP 22 from `0.0.0.0/0` and use **SSM Session Manager** only, **or**
- Restrict TCP 22 to **your home IP only**.

Keep open:

| Port | Protocol | Why |
|------|----------|-----|
| 80 | TCP | HTTP / ACME |
| 443 | TCP | HTTPS + Socket.io WSS |
| 3478 | TCP + UDP | TURN |
| 49152–49200 | UDP | TURN relay |

---

## Phase 6 — Log into the EC2 instance

```powershell
# Replace i-xxxxxxxx with InstanceId output
aws ssm start-session --target i-xxxxxxxx --region ap-south-1
```

You are now on Amazon Linux 2023 as `ssm-user` / root context depending on config. Switch to a normal shell if needed:

```bash
sudo -i
```

---

## Phase 7 — Configure coturn (voice)

On the instance:

```bash
# Put the SAME value as Secrets Manager TURN_SECRET
sudo sed -i 's/static-auth-secret=.*/static-auth-secret=PASTE_TURN_SECRET/' /etc/coturn/turnserver.conf

# If coturn package did not install via userdata, install it:
# sudo dnf install -y coturn   # or build from source / Docker if missing

sudo systemctl enable --now coturn
sudo systemctl status coturn
```

Confirm listening:

```bash
ss -ulnp | grep 3478
```

If coturn is missing from AL2023 repos, run it via Docker instead:

```bash
docker run -d --name coturn --network host \
  -e DETECT_EXTERNAL_IP=yes \
  coturn/coturn \
  -n --log-file=stdout \
  --use-auth-secret --static-auth-secret=PASTE_TURN_SECRET \
  --realm=bridgeonline \
  --listening-port=3478 \
  --min-port=49152 --max-port=49200
```

---

## Phase 8 — Install Node and the app on EC2

Still on the instance:

```bash
# Node 22 (Amazon Linux)
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs git

cd /opt
git clone https://github.com/AkhtarShadab/BridgeOnlineNEXTJS.git bridgeonline
cd bridgeonline
git checkout AWSDep

cp deploy/aws/env.aws.template .env
nano .env   # or vi
```

### Fill `.env` (critical fields)

Replace placeholders with your real values:

```bash
NEXTAUTH_URL=https://YOUR_DOMAIN_OR_HTTPS_HOST
AUTH_TRUST_HOST=true
NEXTAUTH_SECRET=<same as Secrets Manager>

DATABASE_URL=postgresql://postgres.zxglihcentjhwwxqkprb:YOUR_DB_PASSWORD@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://postgres.zxglihcentjhwwxqkprb:YOUR_DB_PASSWORD@aws-1-ap-south-1.pooler.supabase.com:5432/postgres

REDIS_URL=redis://<RedisPrimaryEndpoint>:6379

FEATURE_VOICE_CHAT=true
NEXT_PUBLIC_FEATURE_VOICE_CHAT=true
TURN_URL=turn:<ElasticIp>:3478?transport=udp
TURN_SECRET=<same as coturn / Secrets Manager>
TURN_TTL=3600

FEATURE_RECONNECT_GRACE=true
NEXT_PUBLIC_FEATURE_RECONNECT_GRACE=true

FEATURE_AI_HINTS=false
FEATURE_HOT_COLD_STATE=false
FEATURE_ACTION_QUEUE=false

NODE_ENV=production
PORT=3000
```

Build and start:

```bash
npm ci --legacy-peer-deps
npx prisma generate
npm run build

# Quick smoke test (foreground)
npm run start:all
```

In another SSM session (or from laptop):

```bash
curl -s http://127.0.0.1:3000/api/health
# expect: "db":"up","redis":"up"
```

Stop the foreground process (`Ctrl+C`) once healthy, then install a process manager:

```bash
npm install -g pm2
pm2 start npm --name bridgeonline -- run start:all
pm2 save
pm2 startup
# run the command pm2 prints
```

---

## Phase 9 — HTTPS with Caddy (recommended)

Point your DNS **A record** to the Elastic IP (`play.example.com` → EIP).

On the instance:

```bash
dnf install -y dnf-plugins-core
# Official Caddy repo varies by distro; if package missing, use the static binary:
curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=arm64" -o /usr/local/bin/caddy
chmod +x /usr/local/bin/caddy

cat >/etc/caddy/Caddyfile <<'EOF'
play.example.com {
  reverse_proxy 127.0.0.1:3000
}
EOF

# Adjust service unit as needed; simplest test:
caddy run --config /etc/caddy/Caddyfile
```

Update `.env`:

```bash
NEXTAUTH_URL=https://play.example.com
```

Rebuild if you baked `NEXT_PUBLIC_*` differently, then:

```bash
pm2 restart bridgeonline
```

Caddy auto-provisions Let's Encrypt certificates when DNS points at the EIP and ports 80/443 are open.

---

## Phase 10 — Verify everything

From your laptop:

```powershell
curl -s https://play.example.com/api/health
# {"status":"ok","db":"up","redis":"up",...}

curl -s https://play.example.com/api/voice/turn-credentials
# should include "iceServers" with a turn: entry (when authenticated / as implemented)
```

In the app logs (`pm2 logs bridgeonline`):

- `[Socket.io] Redis adapter enabled`
- No Prisma tenant/password errors

Manual game test:

1. Open the site in two browsers (or two devices on different networks).
2. Register / login, create a table, play a few cards.
3. Toggle voice — audio should work when TURN is reachable (UDP 3478 + relay range).
4. Refresh mid-hand with reconnect grace on — seat should restore within ~30s.

---

## Phase 11 — Day-2 operations

### Update the app

```bash
cd /opt/bridgeonline
git pull origin AWSDep
npm ci --legacy-peer-deps
npx prisma generate
npm run build
pm2 restart bridgeonline
```

### Watch cost

- AWS Billing → Cost Explorer
- Destroy when done playing for the week if you want to freeze spend:

```powershell
cd D:\dev\BridgeOnlineNEXTJS\deploy\aws\cdk
npx cdk destroy BridgeOnlineRedisVoice
```

This deletes EC2, Redis, EIP association, etc. Supabase data is untouched.

### Security follow-ups

- Rotate Supabase DB password if it was ever pasted in chat.
- Restrict SSH; prefer SSM.
- Never commit a filled `.env`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `aws` not recognized | Reinstall CLI; open a **new** terminal; check PATH |
| CDK deploy fails on ElastiCache | Ensure 2 AZs / public subnets created; wait and retry; check IAM |
| `/api/health` redis `down` | App SG → Redis SG on 6379; `REDIS_URL` host correct; same VPC |
| Prisma `tenant/user not found` | Wrong pooler host — must be `aws-1-ap-south-1` for this project |
| Prisma auth failed | Reset Supabase DB password; update `.env` + Secrets Manager |
| Voice works on LAN but not remote | TURN ports blocked; confirm `TURN_URL` uses Elastic IP; secret mismatch with coturn |
| Socket drops after 60s | If you later add an ALB, raise idle timeout to 3600; with Caddy→Node this is usually fine |
| Free Render still running | Fine in parallel; friends should use the **AWS HTTPS URL** |

---

## Quick path (cheaper, no ElastiCache)

If you only want Redis + app on one box (~$12–15/mo) and can skip managed Redis:

1. Launch a Lightsail/EC2 yourself (or keep the CDK EC2 and delete the ElastiCache resource).
2. `dnf install -y redis` / `systemctl enable --now redis`
3. `REDIS_URL=redis://127.0.0.1:6379`
4. Same app + Caddy + coturn steps as above.

See also [`aws-redis-credits.md`](./aws-redis-credits.md).

---

## Reference files in this repo

| Path | Role |
|------|------|
| `deploy/aws/cdk/` | Infrastructure as Code |
| `deploy/aws/env.aws.template` | Env template |
| `deploy/aws/README.md` | Asset index |
| `docs/2-deployment-guide/aws.md` | Full AWS map (ECS/ALB later) |
| `docs/bridgeonline-aws-redis-voice.drawio` | Architecture diagram |
