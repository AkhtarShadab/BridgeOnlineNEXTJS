# AWS deployment assets (branch `AWSDep`)

| File | Purpose |
|------|---------|
| [**Deploy guide (what/how/why + lessons)**](../../docs/2-deployment-guide/aws-deploy-step-by-step.md) | Full walkthrough, glossary, costs, Free Tier vs credits, **live 4 GB host playbook** |
| [`env.aws.template`](./env.aws.template) | Env vars for EC2 with Redis + voice TURN |
| [`cdk/`](./cdk/) | Optional CDK stack (may hit Free Tier instance limits) |
| [`setup-fresh-host.sh`](./setup-fresh-host.sh) | Optional first-boot package helper (check CPU arch for Caddy) |
| [Redis + credits](../../docs/2-deployment-guide/aws-redis-credits.md) | Lighter Redis-focused path |
| [Architecture diagram](../../docs/bridgeonline-aws-redis-voice.drawio) | Players → EC2/coturn → Redis / Supabase |
| [Full AWS map](../../docs/2-deployment-guide/aws.md) | ECS · RDS · ALB (later) |

## Live friends-play host (working)

| | |
|--|--|
| Instance | `i-0ced4339575fd037c` (4 GB RAM, Amazon Linux 2023 **x86_64**) |
| URL | `http://13.127.122.215` |
| Redis | On-box `redis6` → `REDIS_URL=redis://127.0.0.1:6379` |
| Proxy | Caddy **amd64** → Node `:3000` |
| Process | pm2 `bridgeonline` (`npm run start:all`) |
| Branch | `AWSDep` |
| **Est. AWS cost** | **~$30–40/mo** idle always-on; **~$35–55** with light voice/egress |

**Earlier CDK note:** `t4g.medium` via API can fail Free Tier eligibility even with credits — Console launch of a 4 GB type + on-box Redis was the path that worked.
