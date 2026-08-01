# Deploy BridgeOnline on Render + Supabase (no Docker)

Hobby path for playing with friends: one Render Web Service + Supabase Postgres.

## 1. Supabase Postgres

1. Create a project at [supabase.com](https://supabase.com) (region near you, e.g. Mumbai / Singapore).
2. **Project Settings → Database → Connection string**:
   - **URI (Transaction pooler / port 6543)** → `DATABASE_URL`  
     Append `?pgbouncer=true` if not already present (Prisma + pooler).
   - **URI (Direct / port 5432)** → `DIRECT_URL`
3. You do **not** need Supabase Auth — BridgeOnline keeps NextAuth.

Example shapes:

```
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

(Or use the direct host shown in the Supabase dashboard for `DIRECT_URL`.)

## 2. Render Web Service

### Option A — Blueprint (recommended)

1. Push branch `RenderSupabase` to GitHub.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
3. Select this repo + branch `RenderSupabase` (uses `render.yaml`).
4. Fill secrets when prompted: `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL`.

### Option B — Manual Web Service

| Setting | Value |
|---------|--------|
| Runtime | Node |
| Branch | `RenderSupabase` |
| Build | `npm ci --legacy-peer-deps && npx prisma generate && npx prisma db push && npm run build` |
| Start | `npm run start:all` |
| Plan | Free |
| Health check | `/api/health` |

Env vars: same as in `render.yaml`.

After the first deploy, set:

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
- Schema is applied with `prisma db push` during build (fine for hobby; use migrations for production later).
