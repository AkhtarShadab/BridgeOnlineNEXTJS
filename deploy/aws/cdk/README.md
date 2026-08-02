# BridgeOnline CDK — Redis + voice (branch `AWSDep`)

Dev-sized stack for friends play with higher Socket.io TPS and WebRTC voice.

| Resource | Purpose |
|----------|---------|
| VPC (public only, **no NAT**) | Avoid ~$32/mo NAT Gateway |
| EC2 `t4g.small` + Elastic IP | Next.js + Socket.io (`start:all`) + **coturn** |
| ElastiCache Redis `cache.t4g.micro` | `REDIS_URL` → Socket.io adapter + reconnect grace |
| Secrets Manager `bridgeonline/app` | Supabase URLs, `NEXTAUTH_SECRET`, `TURN_SECRET` |

Postgres stays on **Supabase** (already live). Region default: **`ap-south-1`**.

## Prerequisites

1. Install [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and configure credentials (`aws configure`).
2. Node 22+, Docker optional on the instance.
3. Bootstrap CDK once per account/region: `npx cdk bootstrap aws://ACCOUNT/ap-south-1`

## Deploy

```bash
cd deploy/aws/cdk
npm install
npx cdk deploy BridgeOnlineRedisVoice
```

After deploy:

1. Update secret `bridgeonline/app` with real Supabase + NextAuth + TURN values.
2. SSM into the instance (`aws ssm start-session --target <InstanceId>`).
3. Set coturn `static-auth-secret` = `TURN_SECRET`; restart coturn.
4. Clone `AWSDep`, fill `.env` from [`../env.aws.template`](../env.aws.template) using stack outputs (`REDIS_URL`, `TURN_URL`).
5. Build & `npm run start:all`; put Caddy/nginx + Let's Encrypt on 443.
6. Confirm `GET /api/health` → `"redis":"up"` and `GET /api/voice/turn-credentials` returns `iceServers`.

## Estimated monthly cost (ap-south-1 / us-east-1 band)

| Item | ~$/mo |
|------|-------|
| EC2 t4g.small | ~$12–15 |
| EBS 30 GB gp3 | ~$2–3 |
| ElastiCache cache.t4g.micro | ~$12–16 |
| Elastic IP (attached) | $0 |
| Secrets Manager (1 secret) | ~$0.40 |
| TURN egress (friends play) | variable ($1–20+) |
| **Total (idle)** | **~$27–35** |

Fits well inside **$200 AWS credits**. Skip ElastiCache and run Redis on the box to drop to ~$15/mo (see [aws-redis-credits.md](../../../docs/2-deployment-guide/aws-redis-credits.md)).

## Destroy

```bash
npx cdk destroy BridgeOnlineRedisVoice
```
