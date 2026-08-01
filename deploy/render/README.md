# Deploy BridgeOnline on Render + Supabase (no Docker)

Hobby path for playing with friends: one Render Web Service + Supabase Postgres.

## Supabase project (already provisioned)

| | |
|--|--|
| Project | **BridgeOnline** |
| Ref | `zxglihcentjhwwxqkprb` |
| Region | `ap-south-1` (Mumbai) |
| API URL | https://zxglihcentjhwwxqkprb.supabase.co |
| DB host | `db.zxglihcentjhwwxqkprb.supabase.co` |
| Dashboard | https://supabase.com/dashboard/project/zxglihcentjhwwxqkprb |

**Already applied on this database:**

- Full Prisma schema (users, rooms, games, moves, results, friendships, invitations)
- Row Level Security enabled on all app tables
- `anon` / `authenticated` privileges revoked (Prisma-only access)
- Feature 15 performance indexes (`idx_games_room_phase`, `idx_users_stats_gin`, `idx_game_moves_covering`)

You do **not** need Supabase Auth — BridgeOnline keeps NextAuth.

## 1. Get the database password

1. Open [Database settings](https://supabase.com/dashboard/project/zxglihcentjhwwxqkprb/settings/database).
2. Copy or **reset** the database password.
3. Fill `YOUR_DB_PASSWORD` in [`env.supabase.template`](./env.supabase.template) → paste into Render env vars.

Ready-made URL shapes (password only missing):

```
DATABASE_URL=postgresql://postgres.zxglihcentjhwwxqkprb:YOUR_DB_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://postgres:YOUR_DB_PASSWORD@db.zxglihcentjhwwxqkprb.supabase.co:5432/postgres
```

## 2. Render Web Service

### Option A — Blueprint (recommended)

1. Branch `RenderSupabase` is on GitHub.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
3. Select this repo + branch `RenderSupabase` (uses `render.yaml`).
4. Paste `DATABASE_URL`, `DIRECT_URL`, and set `NEXTAUTH_URL` after the first URL is known.

### Option B — Manual Web Service

| Setting | Value |
|---------|--------|
| Runtime | Node |
| Branch | `RenderSupabase` |
| Build | `npm ci --legacy-peer-deps && npx prisma generate && npx prisma db push && npm run build` |
| Start | `npm run start:all` |
| Plan | Free |
| Health check | `/api/health` |

After the first deploy:

```
NEXTAUTH_URL=https://YOUR-SERVICE.onrender.com
```

(`NEXT_PUBLIC_SOCKET_URL` can stay unset — the client uses the page origin.)

## 3. Play

1. Wait for the first deploy (free tier can take several minutes).
2. Open `https://YOUR-SERVICE.onrender.com`.
3. Register → Create room → share invite code with friends.

## Notes

- **Free Render** services sleep after ~15 minutes idle — wake before a session.
- **No Redis** on this path (single instance only).
- **Voice** is off by default (needs TURN across networks).
- Schema is already on Supabase; `prisma db push` on Render stays idempotent / safe to re-run.
