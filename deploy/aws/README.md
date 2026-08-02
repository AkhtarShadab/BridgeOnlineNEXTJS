# AWS deployment assets (branch `AWSDep`)

| File | Purpose |
|------|---------|
| [**Deploy guide (what/how/why + lessons)**](../../docs/2-deployment-guide/aws-deploy-step-by-step.md) | Full walkthrough, glossary, costs, Free Tier vs credits |
| [`env.aws.template`](./env.aws.template) | Env vars for EC2 with Redis + voice TURN |
| [`cdk/`](./cdk/) | CDK stack: VPC · EC2 · EIP · ElastiCache · Secrets |
| [`setup-fresh-host.sh`](./setup-fresh-host.sh) | Optional first-boot package helper |
| [Redis + credits](../../docs/2-deployment-guide/aws-redis-credits.md) | Lighter Redis-focused path |
| [Architecture diagram](../../docs/bridgeonline-aws-redis-voice.drawio) | Players → EC2/coturn → Redis / Supabase |
| [Full AWS map](../../docs/2-deployment-guide/aws.md) | ECS · RDS · ALB (later) |

**Working combo on Free Tier–restricted accounts:** `t4g.small` + **2 GB swap** + stop app during `npm run build` → ~**$27–35/mo** with ElastiCache.

**Blocked until paid EC2 unlocks:** `t4g.medium` via CDK/API (credits alone are not enough).
