# Module 05 — Testing Strategy (5 Layers)

> Sessions 002, 003, 004 | Prerequisite: Modules 02, 03, 04

---

## Why Testing Matters More for a Game Than for a CRUD App

A blog application with a bug might show a slightly wrong word count or a formatting glitch. Users notice, report it, you fix it. The impact is cosmetic.

A card game with a bug has a different failure mode:
- `calculateScore` returns the wrong number → players are silently cheated for every game where that contract type occurred
- `validateBid` accepts an invalid bid → the auction can reach illegal states, breaking the game logic downstream
- Hand filtering sends wrong cards → a player sees their opponent's hand, giving them an unfair advantage they might not even report

These bugs can go unnoticed for hundreds of games. They may be hard to reproduce ("it only happened in a 6NT doubled redoubled vulnerable contract against a reverse finesse"). The economic cost of finding and fixing them in production is enormous.

The solution: test every case, exhaustively, before deploying. The 5-layer test strategy gives 178 tests that run in under 2 minutes locally.

---

## The Testing Pyramid

Before describing each layer, understand the shape of the test suite:

```
          ▲
         /|\
        / | \         Layer 4+5 — E2E, Browser
       /  |  \        20 tests, ~60 seconds, needs browser + server + DB
      /   |   \
     /─────────\      Layer 3 — Socket.io Integration
    /    │      \     20 tests, ~2 seconds, in-process server
   /─────│───────\
  /      │        \   Layer 2 — DB Integration
 /       │         \  35 tests, ~8 seconds, needs Docker DB
/────────│──────────\
/        │           \ Layer 1 — Unit Tests (the bulk)
/────────│────────────\ 123 tests, ~1 second, zero dependencies
```

The pyramid principle:
- **Wide base**: many fast tests that cover pure logic. Run these constantly — on every save if using watch mode.
- **Narrowing middle**: fewer integration tests that verify components connect correctly. Run these before committing.
- **Narrow top**: fewest E2E tests that verify the whole system works. Run these before deploying.

The reason for this shape: higher layers are slower and more brittle (they can fail due to infrastructure issues, network timing, browser behaviour). Lower layers are fast and reliable (a pure function either returns the right value or it doesn't). You want most coverage at the lowest, most reliable layer.

**Anti-pattern to avoid:** An inverted pyramid — many E2E tests, few unit tests. This is slow, flaky, and when a test fails, you don't know which component broke.

---

## Layer 1 — Vitest Unit Tests (123 tests, ~1 second)

**Command:** `npm test`
**What it needs:** Nothing. No database, no server, no browser, no network.
**What it covers:** Every function in `lib/game/`

### What Vitest Is

Vitest is a test runner — a program that finds files matching `**/*.test.ts`, executes each test, and reports which passed and which failed.

It is designed for the Vite/Next.js ecosystem. The key reason Vitest was chosen over Jest (the more common alternative):

**Jest + Next.js ESM = painful.** Next.js 14 uses ECMAScript Modules (the `import`/`export` syntax). Jest was originally designed for CommonJS (`require`/`module.exports`) and adding ESM support requires Babel transformation configuration that is error-prone and slow. Vitest was built from the ground up for ESM — `import` statements work natively with zero configuration.

**Performance.** Vitest uses Vite's build pipeline under the hood. Vite uses esbuild (written in Go) for transpilation — 10–100× faster than Babel. Large test suites that take 30 seconds in Jest often run in under 5 seconds in Vitest.

**Identical API.** Vitest uses the same `describe`, `it`, `expect`, `beforeEach`, `afterEach` API as Jest. If you know Jest, you know Vitest. There's no migration cost to your knowledge.

### Anatomy of a Unit Test

```typescript
// __tests__/unit/scoring.test.ts

describe('game bonuses', () => {
    it('3NT made exactly: 100 trick score (game) → 300 game bonus (not vul) = 400', () => {
        const result = calculateScore(
            { level: 3, suit: 'NT', doubled: false, redoubled: false },
            9,                          // tricks won (exactly enough)
            'NS',                       // declaring side
            { NS: false, EW: false }    // not vulnerable
        );

        expect(result.scoreNS).toBe(400);
        expect(result.scoreEW).toBe(0);
        expect(result.breakdown.trickScore).toBe(100);
        expect(result.breakdown.gameBonus).toBe(300);
    });
});
```

**`describe`**: Groups related tests. The string is the group name, displayed in test output. Nesting describes creates a hierarchy: `scoring > game bonuses > 3NT made exactly`.

**`it`**: A single test case. The string describes what the test verifies — written as a sentence that completes "it...". If the test fails, you see exactly this string in the output, telling you what broke.

**`expect(...).toBe(...)`**: An assertion. If `result.scoreNS` is anything other than `400`, the test fails immediately with a clear message: "Expected: 400 / Received: 370".

### What to Test at This Layer

The key question: "What are all the inputs that produce different outputs?"

For `calculateScore`:
```
Variables:
  - contract level: 1, 2, 3, 4, 5, 6, 7
  - suit: C, D, H, S, NT
  - doubled: yes/no
  - redoubled: yes/no
  - vulnerable: yes/no
  - tricks won: 0..13 (can make or set the contract)

Cross-product: 7 × 5 × 2 × 2 × 2 × 14 = 3,920 combinations
```

You don't test all 3,920. You test **equivalence classes** — groups of inputs that behave identically:
- All partscore contracts (trick score < 100) behave the same in terms of game bonus (always 50)
- All game contracts (trick score ≥ 100) vulnerable behave the same (game bonus = 500)
- Etc.

Testing one representative from each class, plus every boundary (exactly 100 trick score), gives full coverage efficiently.

### The 5 Test Files

| File | Tests | What's Covered |
|---|---|---|
| `scoring.test.ts` | 39 | ACBL duplicate scoring, all phases |
| `bidding.test.ts` | 30 | Bid validation, auction end, contract determination |
| `playing.test.ts` | 18 | Card play rules, trick winner, player order |
| `deck.test.ts` | 12 | Deck generation, shuffle, dealing |
| `cardUtils.test.ts` | 24 | Card format conversion, rank ordering |

---

## Layer 2 — DB Integration Tests (35 tests, ~8 seconds)

**Command:** `npm run test:db`
**What it needs:** Docker (runs a PostgreSQL container)
**What it covers:** Prisma schema + real PostgreSQL behaviour

### Why Integration Tests Are Different from Unit Tests

Unit tests verify that a function computes the right value. Integration tests verify that two components work together correctly.

For database tests specifically: you're testing that:
1. The schema you designed actually enforces the rules you think it does
2. The Prisma queries you wrote actually return the data you think they return
3. The interactions between models work correctly

None of this is visible in a unit test — the schema constraints live in the database, not in TypeScript.

### The Global Setup: Schema Migration

Before any DB test runs, the schema must be pushed to the test database. Vitest calls a `globalSetup` function once before running any test files:

```typescript
// __tests__/helpers/db-setup.ts

export async function setup() {
    execSync('npx prisma db push --skip-generate', {
        env: { ...process.env },
        timeout: 60_000,
    });
    console.log('[db-setup] Schema pushed to test DB');
}
```

**`prisma db push`** vs **`prisma migrate`** — an important distinction:

`prisma db push` takes the current schema and applies it to the database, diffing from current state. It does not create migration files. This is appropriate for test environments where you don't need a migration history — you just want the current schema applied to a fresh database.

`prisma migrate deploy` applies existing migration files in order. This is what you'd use in production to safely evolve the schema with a recorded history.

For tests: `db push` is simpler and faster. There are no migration files to manage, and the database is always rebuilt from scratch (the Docker container starts empty).

**The `--force-reset` removal (Bug fixed in Session 004):**

The original command was `prisma db push --force-reset --skip-generate`. The `--force-reset` flag drops and recreates all tables before pushing. Prisma's safety guard blocks this flag when it detects it's being called from an AI agent context (Claude Code), to prevent accidental data destruction.

The fix was removing `--force-reset`. It wasn't needed anyway — the Docker container starts completely empty every time, so there's nothing to reset. This is a good example of why understanding what a flag does matters: `--force-reset` only adds value when the target database already has data that needs to be cleared, which isn't the case here.

### The Concurrency Bug and Its Fix

**What happened:** `vitest.config.db.ts` had `singleFork: true` but not `fileParallelism: false`. The distinction:

- `singleFork: true` — all test files run in one OS process (avoiding the overhead of multiple Node.js processes)
- `fileParallelism: false` — test files run sequentially, one at a time

Without `fileParallelism: false`, Vitest ran `rooms.test.ts`, `games.test.ts`, `users.test.ts`, and `hand-filter.test.ts` concurrently in the same process. All four files share the same PostgreSQL connection and the same database state.

Each file had:
```typescript
beforeEach(async () => { await cleanDatabase(); });
```

The race condition:
```
T=0: rooms.test.ts beforeEach → cleanDatabase() starts
T=0: games.test.ts starts → createUser() → user-1 created in DB
T=1: cleanDatabase() deletes user-1
T=2: games.test.ts → createRoom(user-1.id) → FK violation! user-1 doesn't exist
```

**The fix:**
```typescript
// vitest.config.db.ts
test: {
    singleFork: true,
    fileParallelism: false,  // files run one at a time — no shared state conflicts
}
```

**Why not fix this differently:**

Alternative A: Use database transactions that roll back after each test. This is theoretically better (faster, allows file parallelism) but Prisma makes transaction-based isolation hard to implement correctly across multiple test files with separate Prisma client instances.

Alternative B: Use a unique database per test file. Requires creating 4 databases, 4 Prisma configurations. High overhead.

The `fileParallelism: false` fix is correct, simple, and the overhead (sequential file execution instead of parallel) is minimal for 35 tests.

### Testing Schema Constraints Directly

```typescript
// __tests__/db/rooms.test.ts

it('prevents two players from taking the same seat', async () => {
    const [u1, u2] = await Promise.all([createTestUser(), createTestUser()]);
    const room = await createTestRoom(u1.id);

    await testPrisma.gamePlayer.create({
        data: { gameRoomId: room.id, userId: u1.id, seat: 'NORTH' }
    });

    // This should throw — the DB unique constraint @@unique([gameRoomId, seat])
    await expect(
        testPrisma.gamePlayer.create({
            data: { gameRoomId: room.id, userId: u2.id, seat: 'NORTH' }
        })
    ).rejects.toThrow();
});
```

This test does not test application code. It tests that the database schema rule is actually enforced. If someone removes `@@unique([gameRoomId, seat])` from the schema (accidentally or intentionally), this test fails immediately. Without this test, the removal might not be caught until two players somehow end up in the same seat in production.

---

## Layer 3 — Socket.io Integration Tests (20 tests, ~2 seconds)

**Command:** `npm run test:socket`
**What it needs:** Nothing. The server runs in-process.
**What it covers:** Socket.io handlers, event routing, hand filtering

### Why These Are Different from Unit and DB Tests

Unit tests test pure functions. DB tests test schema + SQL. Socket.io tests test the **event handlers** — the code that receives a socket event, validates it, updates state, and broadcasts back.

These handlers mix several concerns:
- They call pure game logic functions (tested in Layer 1)
- They manage room membership
- They filter data before sending to each client
- They follow the correct event naming and payload shape

None of this is visible in a unit test (no sockets involved) or a DB test (no socket handlers involved). Layer 3 tests specifically verify that the event-driven behaviour is correct.

### The In-Process Server Pattern

```typescript
// __tests__/helpers/socket-server.ts

import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient, Socket } from 'socket.io-client';
import { registerHandlers } from '../../lib/socket/register-handlers.js';

export interface TestSocketServer {
    io: Server;
    httpServer: ReturnType<typeof createServer>;
    url: string;
    close: () => Promise<void>;
}

export async function createTestServer(): Promise<TestSocketServer> {
    const httpServer = createServer();
    const io = new Server(httpServer, {
        cors: { origin: '*' }
    });

    // Use the SAME handler registration as production
    registerHandlers(io);

    await new Promise<void>((resolve) => {
        httpServer.listen(0, '127.0.0.1', resolve);
    });

    const { port } = httpServer.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}`;

    return {
        io,
        httpServer,
        url,
        close: () => new Promise((resolve) => httpServer.close(() => resolve())),
    };
}

export function connectClient(url: string): Socket {
    return ioClient(url, { autoConnect: true, forceNew: true });
}
```

**`forceNew: true`** in `connectClient` — by default, the Socket.io client reuses existing connections to the same URL. In tests, each call to `connectClient` should be a new, independent connection. `forceNew: true` prevents connection reuse.

**`127.0.0.1` instead of `localhost`** — On some systems, `localhost` resolves to `::1` (IPv6) but the server binds to `0.0.0.0` (IPv4 wildcard). This can cause connection failures. Using the explicit IPv4 loopback address is more reliable in tests.

### What the Socket Tests Verify

```typescript
// __tests__/socket/room.test.ts

it('does NOT send room:player_joined back to the joining player', async () => {
    const alice = connectClient(server.url);
    await waitForEvent(alice, 'connect');

    let selfNotified = false;
    alice.on('room:player_joined', () => { selfNotified = true; });
    alice.emit('room:join', { roomId: 'self-check-room' });

    await new Promise(r => setTimeout(r, 100));  // wait for any events to arrive
    expect(selfNotified).toBe(false);

    disconnectAll(alice);
});
```

This test verifies a specific event routing rule: when Alice joins a room, she should NOT receive her own join notification (other players should, but not her). This uses `socket.to(room)` not `io.to(room)`.

This is the kind of test that:
- Cannot be a unit test (needs real sockets)
- Does not need a database
- Tests exact emit/receive routing behaviour

---

## Layer 4 — Playwright E2E Tests (17 tests, ~30-60 seconds)

**Command:** `npm run test:e2e`
**What it needs:** Playwright Chromium + dev server + test database
**What it covers:** Full user journeys in a real browser

### What Playwright Is

Playwright is a library that controls a real browser (Chromium, Firefox, or WebKit) programmatically. It can:
- Navigate to URLs
- Click buttons and links
- Fill forms
- Assert on visible text and elements
- Run multiple isolated browser contexts simultaneously

**Why Playwright over Cypress (the most common alternative):**

Cypress runs tests inside a special Chromium instance. It has an excellent visual debugging UI and is very beginner-friendly. However:

1. **Multiple browser contexts.** Testing 4 players simultaneously requires 4 isolated browser sessions (separate cookies, separate localStorage). Playwright supports `browser.newContext()` for isolated sessions natively. Cypress cannot do this — it only supports one session per test and requires significant workarounds for multi-user flows.

2. **TypeScript first.** Playwright has TypeScript support out of the box. Cypress's TypeScript support requires additional configuration.

3. **Cross-browser.** Playwright tests can run on Chromium, Firefox, and WebKit in one command. Cypress only supports Chromium-based browsers.

4. **Performance.** Playwright runs tests in separate worker processes. Cypress runs all tests in the same browser instance — slower and with more state leakage.

### The WebServer Configuration

```typescript
// playwright.config.ts

webServer: {
    command: 'npm run dev',          // Start the Next.js dev server
    url: 'http://localhost:3000',    // Wait until this URL responds
    reuseExistingServer: !process.env.CI,  // In CI: always start fresh; locally: reuse if running
    timeout: 120_000,                // Up to 2 minutes to start
},
```

Playwright handles server lifecycle: it starts `npm run dev`, waits for `localhost:3000` to respond, runs all tests, then stops the server. In local development, `reuseExistingServer: true` means if you already have the dev server running, Playwright won't start another one — tests start faster.

### A 4-Player E2E Test

```typescript
// __tests__/e2e/full-game.spec.ts

it('4 players can join a room and reach the ready state', async ({ browser }) => {
    // Create 4 isolated browser contexts (different users, different sessions)
    const contexts = await Promise.all([
        browser.newContext(),
        browser.newContext(),
        browser.newContext(),
        browser.newContext(),
    ]);

    const [p1, p2, p3, p4] = await Promise.all(
        contexts.map(ctx => ctx.newPage())
    );

    // Each player registers and logs in
    const [u1, u2, u3, u4] = await Promise.all([
        registerAndLogin(p1),
        registerAndLogin(p2),
        registerAndLogin(p3),
        registerAndLogin(p4),
    ]);

    // Player 1 creates a room
    await p1.goto('/create-room');
    await p1.fill('[name="roomName"]', 'Test Room');
    await p1.click('[data-testid="create-room-btn"]');
    await p1.waitForURL(/\/room\/.+/);

    const inviteCode = await p1.textContent('[data-testid="invite-code"]');

    // Players 2, 3, 4 join with the invite code
    await Promise.all([
        p2.goto(`/join-room?code=${inviteCode}`),
        p3.goto(`/join-room?code=${inviteCode}`),
        p4.goto(`/join-room?code=${inviteCode}`),
    ]);

    // Assert all 4 seat slots are visible
    await expect(p1.locator('[data-seat="NORTH"]')).toBeVisible();
    await expect(p1.locator('[data-seat="SOUTH"]')).toBeVisible();
    await expect(p1.locator('[data-seat="EAST"]')).toBeVisible();
    await expect(p1.locator('[data-seat="WEST"]')).toBeVisible();

    // Cleanup
    await Promise.all(contexts.map(ctx => ctx.close()));
});
```

**What this test proves:**
- The room creation API works
- The join-by-invite-code flow works
- The Socket.io server correctly notifies all players of new arrivals
- The room page renders correctly for 4 simultaneous players

**What this test does NOT prove:** That the underlying functions are correct. It doesn't verify the score formula or the bid validation — those are in Layer 1.

This is by design. E2E tests verify the "happy path" — that the entire system integrates correctly. Unit tests verify correctness of individual functions. Both are necessary.

---

## Layer 5 — Playwright WebRTC Signaling Tests (3 tests)

**Command:** included in `npm run test:e2e`
**What it covers:** Socket.io relay of voice signaling messages

### Why These Tests Are in Layer 5 (Not Layer 3)

WebRTC signaling tests could theoretically be Socket.io integration tests (Layer 3) — the signaling relay is just Socket.io event routing. But testing the signaling security property (offers only reach the intended peer, not broadcast to all) requires confirming that a *third party* does NOT receive an event.

In a browser context (Playwright), you can check that a third socket in the room does not receive an offer intended for a different peer. In a pure Socket.io test, the same is possible, but the test setup more naturally matches real browser behaviour when done at the E2E layer.

```typescript
// __tests__/e2e/voice-signaling.spec.ts

it('Socket.io signaling relay: offer only reaches intended peer', async ({ browser }) => {
    const [aliceCtx, bobCtx, carolCtx] = await Promise.all([
        browser.newContext(), browser.newContext(), browser.newContext()
    ]);

    // 3 players in the same room
    // Alice sends a voice offer to Bob
    // Carol should NOT receive it (she's in the same room but the offer is for Bob)

    await alicePage.evaluate(({ bobSocketId }) => {
        window.socket.emit('voice:offer', { to: bobSocketId, sdp: 'mock-sdp-offer' });
    }, { bobSocketId });

    // Bob receives it
    const bobReceived = await bobPage.evaluate(() => {
        return new Promise(resolve =>
            window.socket.once('voice:offer', resolve)
        );
    });
    expect(bobReceived).toMatchObject({ from: aliceSocketId });

    // Carol does NOT receive it (wait 500ms and check)
    const carolReceived = await carolPage.evaluate(() => {
        return new Promise((resolve) => {
            let received = false;
            window.socket.once('voice:offer', () => { received = true; });
            setTimeout(() => resolve(received), 500);
        });
    });
    expect(carolReceived).toBe(false);
});
```

This test verifies a **security property**: voice signaling is point-to-point, not broadcast. If the server accidentally used `io.to(room).emit(...)` for voice offers instead of `io.to(peerId).emit(...)`, every player in the room would receive every other player's signaling — and any WebRTC security based on this routing would be broken.

---

## The CI Pipeline: Making Tests Automatic

All tests run automatically on every push to `master` via GitHub Actions:

```yaml
# .github/workflows/all-tests.yml

jobs:
  unit-and-socket:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm test          # Layer 1
      - run: npm run test:socket  # Layer 3

  db-integration:
    runs-on: ubuntu-latest
    services:
      postgres:                # GitHub Actions-native service container
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: bridgeonline_test
        ports: ["5433:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-retries 10
    env:
      DATABASE_URL: postgresql://test:test@localhost:5433/bridgeonline_test?schema=public
    steps:
      - ...
      - run: npx prisma db push --skip-generate
      - run: npm run test:db   # Layer 2

  e2e:
    runs-on: ubuntu-latest
    steps:
      - ...
      - run: sudo npx playwright install-deps chromium  # system libraries
      - run: npx playwright install chromium             # browser binary
      - run: npm run test:e2e  # Layers 4+5
```

**Service containers** (GitHub Actions feature): Instead of running `docker-compose up` as a step, you declare services in the job definition. GitHub Actions starts the service before the job steps and provides it at `localhost:5433`. This is cleaner because the service lifecycle is managed by the CI platform.

**`--health-cmd pg_isready`:** The CI waits until PostgreSQL is actually ready to accept connections before starting the test steps. Without this, `npm run test:db` might start before PostgreSQL finishes initialising, causing connection failures.

**Three separate jobs:** They run in parallel on separate VMs. Layer 1+3 finishes in ~30 seconds while Layer 2 and E2E are still running. This maximises CI throughput.

---

## Local Development Workflow

```bash
# While writing game logic — instant feedback, runs on every save
npm run test:watch

# Before committing — all fast tests
npm test && npm run test:socket

# After changing the DB schema — start Docker if not running, then test
npm run test:db:start
npm run test:db

# Before opening a PR — everything except E2E
npm test && npm run test:socket && npm run test:db

# Full verification (slow, before release)
npm run test:all
```

The pattern: run faster, more reliable tests frequently. Run slower tests at deliberate checkpoints.

---

## Summary: What Each Layer Catches

| Test | Layer | Bug It Would Catch |
|---|---|---|
| `calculateScore` 6S not vul | 1 | Slam bonus wrong formula |
| `isBiddingComplete` 3 passes | 1 | Auction end detection off by one |
| `shuffleDeck` bias check | 1 | Shuffle algorithm changed to biased sort |
| Room FK constraint | 2 | Schema: `@relation` accidentally removed |
| Seat unique constraint | 2 | Schema: `@@unique([gameRoomId, seat])` removed |
| `room:join` broadcast | 3 | Handler uses wrong event name |
| Hand filter per player | 3 | Server sends all hands to everyone |
| 4-player join flow | 4 | Invite code flow broken end-to-end |
| Voice offer to correct peer | 5 | Signaling accidentally broadcasts to room |

No single layer catches all categories of bugs. The 5-layer strategy provides defence in depth.

---

**Next:** [Module 06 — WebRTC & Voice Chat](./06-webrtc-voice.md)
