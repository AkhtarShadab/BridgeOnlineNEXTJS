# AWS deployment assets (branch `AWSDep`)

| File | Purpose |
|------|---------|
| [`env.aws.template`](./env.aws.template) | Env vars for Lightsail/EC2/ECS with Redis |
| [Guide: Redis + AWS credits](../../docs/2-deployment-guide/aws-redis-credits.md) | Step-by-step for higher game TPS |
| [Full AWS map](../../docs/2-deployment-guide/aws.md) | ECS · RDS · ElastiCache · ALB |

**Quick path:** install Redis on the same box → set `REDIS_URL=redis://127.0.0.1:6379` → `npm run start:all` → confirm `/api/health` shows `"redis":"up"`.
