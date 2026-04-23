# Module 10 — E2E Integration, Playwright Config, and the Node.js 24 Environment Bug

> Session 007 | Prerequisite: Module 05 (Testing Strategy)

---

## The Bug We Found: A Silent Environment Variable Gap

Running `npm run test:e2e` failed immediately — before a single test ran — with this error:

```
[WebServer] Error: Could not find a production build in the '.next' directory.
Try building your app with 'next build' before starting the production server.
```

This error has nothing to do with the tests themselves. It comes from Next.js during server startup. Understanding why it happens requires tracing how environment variables flow from your terminal into the Playwright webServer process — and how Node.js 24 changed the default value of `NODE_ENV`.

---

## How the Server Starts: The Environment Variable Chain

Playwright E2E tests don't run against a pre-existing server. The `playwright.config.ts` tells Playwright to start one:

```typescript
webServer: {
  command: 'npm run dev',      // runs `node server/index.js`
  url: 'http://localhost:3000',
  reuseExistingServer: !process.env.CI,
  env: {
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? '',
    // ...
  },
},
```

When Playwright starts this process, it does **not** automatically inherit all environment variables from the parent shell. The `env` block is explicit: only the variables listed there reach `server/index.js`. Any variable not listed is absent in the child process.

Inside `server/index.js`:

```javascript
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, hostname, port });
```

`dev` controls whether Next.js starts in development mode (hot reload, no build required) or production mode (serves a pre-built `.next/` directory). If `dev` is `false`, Next.js looks for a production build and crashes if none exists.

---

## The Node.js 24 Change: `NODE_ENV` Now Defaults to `"production"`

In Node.js versions before 24, `process.env.NODE_ENV` was `undefined` when not set. The expression:

```javascript
const dev = undefined !== 'production';  // → true → dev mode ✓
```

This worked fine. E2E tests ran because `dev` was always `true` when `NODE_ENV` was unset.

**Node.js 24 changed this.** When `NODE_ENV` is not set by the caller, Node.js 24 now sets it to `"production"` automatically. The expression becomes:

```javascript
const dev = 'production' !== 'production';  // → false → production mode ✗
```

Next.js enters production mode, finds no `.next/` production build, and crashes.

**Why this only showed up locally:** The GitHub Actions CI workflow sets `NODE_ENV: test` explicitly at the job level, so the Playwright process (and its child webServer process) had `NODE_ENV=test`. Locally, `NODE_ENV` was typically unset in the shell — fine before Node 24, broken after.

---

## The Fix: Explicitly Forward `NODE_ENV` in the webServer `env` Block

```typescript
// playwright.config.ts — BEFORE
webServer: {
  command: 'npm run dev',
  env: {
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? '',
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
  },
},

// playwright.config.ts — AFTER
webServer: {
  command: 'npm run dev',
  env: {
    // Explicitly forward NODE_ENV — Playwright's env block does NOT auto-inherit
    // parent process vars. Node.js ≥ 24 defaults NODE_ENV to "production" when
    // unset, which causes Next.js to require a production build. Pass "development"
    // so server/index.js always starts Next.js in dev mode.
    NODE_ENV: process.env.NODE_ENV === 'production'
      ? 'development'
      : (process.env.NODE_ENV ?? 'development'),
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    DIRECT_URL: process.env.DIRECT_URL ?? '',
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? '',
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3000',
  },
},
```

**Why `process.env.NODE_ENV === 'production' ? 'development' : ...`:**

In the CI E2E job, `NODE_ENV` is set to `test` at the job level. `test !== 'production'` so the condition is false and `NODE_ENV=test` passes through. Locally, `NODE_ENV` is undefined (or `development`), so `'development'` is the fallback. The `=== 'production'` guard is a safety net: if somehow the Playwright config process has `NODE_ENV=production` (e.g. a CI misconfiguration), we still override it to `development` so the webServer doesn't crash.

**Why `NEXT_PUBLIC_SOCKET_URL` was also added:**

The room and game pages import this env var on the client side. Without it in the webServer env, the client-side code gets an empty string for the Socket.io URL, causing socket connections to fail silently in E2E tests.

---

## The Second Prerequisite: E2E Tests Need a Live Database

The existing docs said E2E tests need Playwright system deps. They also need the **Docker test database running**. The app connects to `DATABASE_URL` — in the local E2E context, that's `postgresql://test:test@localhost:5433/bridgeonline_test`.

If the Docker container is not running, the dev server starts but every API route that touches the DB returns a 500 error. Auth fails, room creation fails, every test fails.

**Correct local startup sequence:**

```bash
# 1. Start the test DB (once — keep it running while writing tests)
npm run test:db:start

# 2. Push the schema (first time only, or after schema changes)
npx prisma db push --skip-generate

# 3. Run E2E tests
npm run test:e2e
```

**Why this wasn't needed for Layers 1–3:**
- Layer 1 (unit): no DB, pure functions
- Layer 2 (DB integration): uses the same Docker DB, but Vitest manages the lifecycle
- Layer 3 (Socket.io): in-process server, no real DB queries

Layer 4+5 is the first layer that runs the **entire application stack**. Every layer below had their DB needs either eliminated (Layer 1, 3) or managed automatically (Layer 2). Layer 4 is the first time you have to manage it yourself.

---

## The Playwright `env` Block: What It Does and Doesn't Do

This is a common source of confusion. Compare three ways environment variables can reach the webServer process:

### Option A — Shell export (does NOT work)
```bash
export NODE_ENV=development
npm run test:e2e
```
The Playwright config process sees `NODE_ENV=development`, but the webServer child process does NOT inherit it if the `env` block is specified.

### Option B — Inline with the command (works, but brittle)
```typescript
webServer: {
  command: 'NODE_ENV=development npm run dev',
  // ...
}
```
This works because the variable is set before `npm` even starts. But it doesn't play nicely with Windows and doesn't allow dynamic values.

### Option C — `env` block with forwarding (correct)
```typescript
webServer: {
  command: 'npm run dev',
  env: {
    NODE_ENV: process.env.NODE_ENV ?? 'development',  // forward explicitly
    DATABASE_URL: process.env.DATABASE_URL ?? '',
  },
}
```
When `env` is specified in the Playwright webServer config, Playwright builds a clean environment for the child process using only the keys you provide. The parent process `env` serves as a data source (via `process.env.*`) but is not automatically copied.

**The rule:** Every environment variable the webServer needs must appear explicitly in the `env` block.

---

## Playwright `reuseExistingServer` — A Hidden State Problem

```typescript
reuseExistingServer: !process.env.CI,
```

Locally: `true` — if a server is already running at `localhost:3000`, reuse it.
CI: `false` — always start a fresh server.

This is a sensible default, but it creates a hidden state problem locally:

**Scenario:** You have a development server running (`npm run dev` in another terminal), connecting to the **production Supabase DB** (via `.env`). You run `npm run test:e2e`. Playwright reuses the running server — but that server is connected to Supabase, not the Docker test DB. Your E2E tests create real users and rooms in production.

**The fix:** Always make sure no dev server is running before running E2E tests locally, OR run tests with `CI=true`:

```bash
CI=true npm run test:e2e   # always starts a fresh server with .env.test vars
```

In CI this is automatic. Locally it's a discipline issue to be aware of.

---

## DSA Connection: Environment Variables as Configuration Injection

Environment variables are an example of **dependency injection** at the OS level. The application code (`server/index.js`, API routes) doesn't hardcode the database URL — it reads it from the environment at runtime. This is the same principle as passing a dependency through a constructor rather than instantiating it inside the class.

```
// Tight coupling (bad for testing)
const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://prod-host/prod-db" } }
});

// Loose coupling via injection (good for testing)
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
```

Because the connection string is injected at runtime, we can swap it:
- Production: Supabase URL (from `.env`)
- Local dev: Supabase URL (from `.env`)
- Local E2E / CI: Docker test DB URL (from `.env.test`)

The application code is identical across all three environments. Only the injected configuration differs.

**Why `NEXT_PUBLIC_` prefix matters:** Next.js builds client-side code at startup. Only variables prefixed `NEXT_PUBLIC_` are bundled into the client JavaScript. Variables without this prefix are server-only. If `NEXT_PUBLIC_SOCKET_URL` is not set when the dev server starts, the client bundle gets an empty string — and no amount of setting it after startup will fix it. This is why it must be in the webServer `env` block.

---

## The E2E Test Suite: What 20 Tests Cover

### Layer 4 (17 tests in 4 files)

| File | Tests | What's Covered |
|---|---|---|
| `auth.spec.ts` | 5 | Register, duplicate email, wrong password, auth guard, logout |
| `room-lifecycle.spec.ts` | 5 | Create room, invite code, join by code, seat persistence, all 4 seats visible |
| `full-game.spec.ts` | 3 | 4-player join, ready button, room page after game start |
| `reconnect.spec.ts` | 4 | Page reload, navigate away, API state check, CDP offline simulation |

### Layer 5 (3 tests)

| File | Tests | What's Covered |
|---|---|---|
| `voice-signaling.spec.ts` | 3 | Offer→answer→ICE relay, mute relay, user_left cleanup |

### The 4-Browser Context Pattern

The core technique in `full-game.spec.ts` — running 4 isolated browser sessions in one test:

```typescript
test('4 players can join a room', async ({ browser }) => {
  // Each context has its own cookies, localStorage, session — fully isolated
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const pages = await Promise.all(contexts.map(ctx => ctx.newPage()));

  // Register and log in all 4 players concurrently
  await Promise.all(users.map((u, i) => registerAndLogin(pages[i], u)));

  // Player 0 creates room, players 1–3 join via invite code
  // ...

  // Cleanup
  await Promise.all(contexts.map(ctx => ctx.close()));
});
```

**Why `newContext()` and not just `newPage()`:**
Separate pages in the same context share cookies. If Alice logs in and Bob opens a new page in the same context, Bob also appears logged in as Alice. `newContext()` creates a completely isolated browser profile — separate cookie jar, separate localStorage, separate IndexedDB.

This is the reason Playwright was chosen over Cypress for this project (see Module 05): Cypress doesn't support multiple isolated contexts in a single test.

---

## CDP (Chrome DevTools Protocol) for Network Simulation

`reconnect.spec.ts` uses the Chrome DevTools Protocol to simulate a network interruption:

```typescript
const client = await page.context().newCDPSession(page);
await client.send('Network.emulateNetworkConditions', {
  offline: true,
  downloadThroughput: -1,
  uploadThroughput: -1,
  latency: 0,
});

await page.waitForTimeout(2_000);  // wait while "offline"

await client.send('Network.emulateNetworkConditions', {
  offline: false,
  downloadThroughput: -1,
  uploadThroughput: -1,
  latency: 0,
});
```

CDP is the same protocol that Chrome DevTools uses in the browser to inspect, debug, and control the page. Playwright exposes raw CDP access via `newCDPSession()`. The `Network.emulateNetworkConditions` command tells Chromium to act as if the network connection dropped.

**Why `-1` for throughput:** `-1` means "no limit / use default." When `offline: true`, throughput values are ignored anyway.

**What this test verifies:** After the network comes back, Socket.io reconnects automatically and the room page is still functional. This is the observable behaviour without the 30s grace-period protocol (Issue #16) — once that is implemented, the test will be extended to verify the player's seat is preserved during the grace period.

---

## Summary: What Changed and Why

| Problem | Root Cause | Fix |
|---|---|---|
| WebServer crashes on startup | Node.js 24 defaults `NODE_ENV` to `"production"`, Playwright `env` block doesn't auto-forward parent vars | Add `NODE_ENV: process.env.NODE_ENV ?? 'development'` to webServer env |
| Socket.io URL empty in browser | `NEXT_PUBLIC_SOCKET_URL` missing from webServer env | Add `NEXT_PUBLIC_SOCKET_URL` to webServer env |
| E2E tests fail on DB operations | Docker test DB not running | Document prerequisite: `npm run test:db:start` before `npm run test:e2e` |

| Concept | Applied Where |
|---|---|
| Explicit env injection | `playwright.config.ts` webServer `env` block |
| Node.js 24 `NODE_ENV` default | Root cause of the webServer crash |
| Dependency injection via env vars | Why swapping `DATABASE_URL` per environment works |
| `NEXT_PUBLIC_` build-time bundling | Why socket URL must be in webServer env, not just the shell |
| CDP network simulation | `reconnect.spec.ts` offline/online test |
| Isolated browser contexts | 4-player concurrent test in `full-game.spec.ts` |

---

**Next:** [Module 11 — Player Reconnection Protocol & Grace Period](./11-reconnection-protocol.md) *(upcoming)*
