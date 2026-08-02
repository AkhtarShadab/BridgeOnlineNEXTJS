# AWS deployment assets (branch `AWSDep`)

| File | Purpose |
|------|---------|
| [`env.aws.template`](./env.aws.template) | Env vars for EC2/Lightsail with **Redis + voice TURN** |
| [`cdk/`](./cdk/) | CDK stack: EC2 + EIP + ElastiCache + Secrets + coturn ports |
| [**Full deploy walkthrough**](../../docs/2-deployment-guide/aws-deploy-step-by-step.md) | Laptop → CDK → EC2 app → Caddy → verify voice |
| [Guide: Redis + AWS credits](../../docs/2-deployment-guide/aws-redis-credits.md) | Step-by-step for higher game TPS + voice |
| [Architecture diagram](../../docs/bridgeonline-aws-redis-voice.drawio) | Visual: players → EC2/coturn → Redis / Supabase |
| [Full AWS map](../../docs/2-deployment-guide/aws.md) | ECS · RDS · ElastiCache · ALB |

**Recommended (credits):** `cd cdk && npx cdk deploy` → fill `env.aws.template` from stack outputs → enable voice flags → `npm run start:all`.

**Quick path (Redis only):** install Redis on the same box → set `REDIS_URL=redis://127.0.0.1:6379` → `npm run start:all` → confirm `/api/health` shows `"redis":"up"`.
