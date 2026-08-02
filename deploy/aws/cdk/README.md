# BridgeOnline CDK — Redis + voice (branch `AWSDep`)

Friends-play stack: EC2 + ElastiCache + Secrets + coturn ports. Full **what / how / why** guide (including Free Tier vs credits lessons):

→ [`docs/2-deployment-guide/aws-deploy-step-by-step.md`](../../../docs/2-deployment-guide/aws-deploy-step-by-step.md)

| Resource | Purpose |
|----------|---------|
| VPC (public only, **no NAT**) | Avoid ~$32/mo NAT Gateway |
| EC2 (`AppHostMedium` → **t4g.medium** in code) | Next + Socket.io + coturn host |
| ElastiCache Redis `cache.t4g.micro` | `REDIS_URL` for Socket.io adapter |
| Secrets Manager `bridgeonline/app` | Supabase + auth + TURN secrets |
| Elastic IP | Stable public IP / TURN host |

Postgres stays on **Supabase**. Region default: **`ap-south-1`**.

## Important account constraint

**$200 credits ≠ Free Tier eligibility.** Creating **`t4g.medium`** can fail with:

> The specified instance type is not eligible for Free Tier

Until the account can Launch paid EC2 types in the Console, deploy **`t4g.small` + 2 GB swap** instead (edit `instanceType` in `lib/bridgeonline-stack.ts`), or unlock billing/identity verification first.

## Cost bands (approx. ap-south-1)

| Setup | ~$/mo idle |
|-------|------------|
| **t4g.small** + ElastiCache micro + EIP + secret | **~$27–35** (what worked on Free Tier–restricted accounts) |
| **t4g.medium** + same | **~$39–50** (when paid EC2 is allowed) |
| small + Redis on-box (no ElastiCache) | **~$15–20** |

## Commands

```bash
cd deploy/aws/cdk
npm install
npx cdk bootstrap aws://ACCOUNT/ap-south-1   # once
npx cdk deploy BridgeOnlineRedisVoice
npx cdk destroy BridgeOnlineRedisVoice       # stop spend
```

After deploy: fill secrets, SSM in, install Node/Docker/Caddy/coturn, clone `AWSDep`, `.env` from [`../env.aws.template`](../env.aws.template), build with pm2/coturn **stopped** on 2 GB boxes.
