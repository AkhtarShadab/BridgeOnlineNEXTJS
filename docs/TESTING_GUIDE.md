# BridgeOnline — Dev-Mode Testing Guide

> **Scope:** Covers all changes shipped in Sessions 001–006.  
> Follow this guide end-to-end to confirm every layer is working correctly on a fresh clone or after pulling the latest code.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone & Install](#2-clone--install)
3. [Environment Setup](#3-environment-setup)
4. [Start the Dev Server](#4-start-the-dev-server)
5. [Run Test Suites](#5-run-test-suites)
   - 5.1 [Unit Tests (123 tests)](#51-unit-tests-123-tests)
   - 5.2 [Socket.io Integration Tests (20 tests)](#52-socketio-integration-tests-20-tests)
   - 5.3 [DB Integration Tests (35 tests, Docker required)](#53-db-integration-tests-35-tests-docker-required)
   - 5.4 [TypeScript Build Check (23/23 pages)](#54-typescript-build-check-2323-pages)
   - 5.5 [E2E Tests (Playwright)](#55-e2e-tests-playwright)
6. [Manual UI Walkthrough](#6-manual-ui-walkthrough)
7. [API-Level curl Tests](#7-api-level-curl-tests)
   - 7.1 [Auth Flow](#71-auth-flow)
   - 7.2 [Room Lifecycle](#72-room-lifecycle)
   - 7.3 [Bid Flow & Passed-Out Redeal](#73-bid-flow--passed-out-redeal)
8. [Known Issues & Workarounds](#8-known-issues--workarounds)

---

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 (recommend 20 LTS) | Node 24 changes some defaults — see §8 |
| npm | ≥ 10 | Bundled with Node 20 |
| Docker Desktop | Any recent | Required for DB integration tests only |
| Git | Any | — |
| curl + jq | Any | For §7 API tests; `brew install jq` / `apt install jq` |

**Optional — Supabase (hosted Postgres):**  
If you are using a Supabase free-tier project for `DATABASE_URL` it may be paused after 1 week of inactivity. Wake it up at https://supabase.com/dashboard before running any DB-connected tests or the dev server.

---

## 2. Clone & Install

```bash
git clone https://github.com/AkhtarShadab/BridgeOnline.git
cd BridgeOnline
npm install
```

---

## 3. Environment Setup

### 3.1 Main app environment (`.env.local`)

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/bridgeonline?schema=public"
DIRECT_URL="postgresql://user:password@localhost:5432/bridgeonline?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<generate with: openssl rand -base64 32>"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
```

> **Supabase users:** Replace `DATABASE_URL` and `DIRECT_URL` with the values from  
> *Project → Settings → Database → Connection String → URI*.  
> Use the **Pooled** URL for `DATABASE_URL` and the **Direct** URL for `DIRECT_URL`.

### 3.2 Apply the database schema

```bash
npx prisma db push
```

You should see `Your database is now in sync with your Prisma schema.`

---

## 4. Start the Dev Server

```bash
npm run dev
```

This starts **two** processes concurrently:
- **Next.js** on `http://localhost:3000`
- **Socket.io server** on `http://localhost:3001`

**Expected output (no errors):**

```
▲ Next.js 15.x.x
- Local:  http://localhost:3000
✓ Ready in ~2s

Socket.io server listening on port 3001
```

Open `http://localhost:3000` in your browser — you should see the landing / login page.

---

## 5. Run Test Suites

### 5.1 Unit Tests (123 tests)

Tests pure game logic with no external dependencies (no DB, no network).

```bash
npm test
```

**What is covered:**

| File | What it tests |
|------|---------------|
| `__tests__/unit/deck.test.ts` | Card creation, shuffling, dealing |
| `__tests__/unit/cardUtils.test.ts` | Card comparisons, suit hierarchy |
| `__tests__/unit/bidding.test.ts` | Bid validity, ACBL rules, double/redouble |
| `__tests__/unit/playing.test.ts` | Must-follow-suit, trick resolution, dummy reveal |
| `__tests__/unit/scoring.test.ts` | ACBL duplicate scoring, game/slam bonuses |

**Expected result:**

```
Test Files  5 passed (5)
Tests       123 passed (123)
Duration    ~2s
```

**Session coverage:** Sessions 001–004 game logic; Session 005 bidding rule fixes.

---

### 5.2 Socket.io Integration Tests (20 tests)

Tests real-time events between the server and connected clients. No DB required.

```bash
npm run test:socket
```

**What is covered:**

| File | What it tests |
|------|---------------|
| `__tests__/socket/room.test.ts` | Player join/leave, ready state, room lifecycle |
| `__tests__/socket/game.test.ts` | game:started, game:bid_made, game:contract_established, game:card_played, game:passed_out |
| `__tests__/socket/voice-signaling.test.ts` | WebRTC offer/answer/ICE relay through Socket.io |

**Expected result:**

```
Test Files  3 passed (3)
Tests       20 passed (20)
Duration    ~3s
```

**Timeout:** Each test has a 15 s timeout — failures pointing to timeouts suggest the Socket.io server process did not start correctly inside the test harness.

---

### 5.3 DB Integration Tests (35 tests, Docker required)

Tests Prisma queries against a real PostgreSQL instance running in Docker.

#### Step 1 — Start test database

```bash
npm run test:db:start
```

This runs `docker-compose.test.yml` which starts PostgreSQL 16 on port **5433** (separate from your dev DB on 5432) with in-memory storage (`tmpfs`) so it is always clean.

Verify it is up:

```bash
docker ps | grep bridgeonline_test
```

#### Step 2 — Apply schema to test database

```bash
npm run test:db:reset
```

This runs `prisma db push --force-reset` against `.env.test` (port 5433).

#### Step 3 — Run tests

```bash
npm run test:db
```

**What is covered:**

| File | What it tests |
|------|---------------|
| `__tests__/db/users.test.ts` | User creation, auth lookup, unique constraints |
| `__tests__/db/rooms.test.ts` | Room CRUD, invite codes, seat assignment |
| `__tests__/db/games.test.ts` | Game creation, move persistence, state transitions |
| `__tests__/db/hand-filter.test.ts` | Hand data returned to each player (no peeking at others' cards) |

**Expected result:**

```
Test Files  4 passed (4)
Tests       ~35 passed
Duration    ~10–20s
```

Tests run **serially** (`singleFork: true`) to avoid Prisma connection pool conflicts. Each test file wraps operations in transactions that are rolled back on teardown.

#### Step 4 — Stop test database (optional)

```bash
npm run test:db:stop
```

---

### 5.4 TypeScript Build Check (23/23 pages)

Verifies the entire Next.js app compiles without TypeScript errors — the key deliverable of Session 006.

```bash
npm run build
```

**Expected output (last few lines):**

```
Route (app)                              Size     First Load JS
┌ ○ /                                    ...
...
✓ Compiled successfully
   Generating static pages (23/23)
```

All 23 pages must compile without errors or warnings. Any TypeScript error will cause a non-zero exit code.

> **Note:** The build uses your `.env.local` for environment variables. Make sure `DATABASE_URL` is reachable; the build does not execute queries but Prisma client generation needs the env var present.

---

### 5.5 E2E Tests (Playwright)

Runs full browser automation against a locally-started Next.js server.

```bash
npm run test:e2e
```

Or with the interactive Playwright UI:

```bash
npm run test:e2e:ui
```

**What is covered:**

| File | Scenario |
|------|----------|
| `auth.spec.ts` | Register, login, logout |
| `room-lifecycle.spec.ts` | Create room, join, seat selection, ready state |
| `full-game.spec.ts` | Complete game: bidding through scoring |
| `reconnect.spec.ts` | Player disconnect and reconnect within 30 s |
| `voice-signaling.spec.ts` | WebRTC offer/answer exchange |

**Important:** E2E tests require a working database. Make sure your `.env.local` points to a live PostgreSQL instance before running.

**Known partial failures:** `full-game.spec.ts` may fail on the bidding → playing transition because the `game:passed_out` Socket.io event does not yet have a client-side UI handler. See §8 for details.

---

## 6. Manual UI Walkthrough

Use four browser tabs (or separate incognito windows) to simulate four players.

### 6.1 Register four accounts

Navigate to `http://localhost:3000/register` in each tab and create:

| Player | Username | Email |
|--------|----------|-------|
| 1 | `north_player` | `north@test.com` |
| 2 | `east_player` | `east@test.com` |
| 3 | `south_player` | `south@test.com` |
| 4 | `west_player` | `west@test.com` |

### 6.2 Create a room (Player 1)

1. Log in as `north_player`.
2. Go to `http://localhost:3000/dashboard`.
3. Click **Create Room**.
4. Note the **Invite Code** displayed (e.g. `ABC123`).
5. Select seat **North**.
6. Click **Ready**.

### 6.3 Join the room (Players 2–4)

In each remaining tab:

1. Log in as the respective player.
2. Go to `http://localhost:3000/join-room`.
3. Enter the invite code.
4. Select a different seat (East / South / West).
5. Click **Ready**.

### 6.4 Start the game

Once all four players are marked Ready, the game starts automatically.

**What to verify:**
- [ ] Each player sees their 13 cards.
- [ ] Dealer indicator is shown correctly.
- [ ] Bidding box is enabled only for the dealer on the first turn.

### 6.5 Bid through the auction

Use the bidding box to make bids. Standard test sequence to trigger a **contract**:

```
North: 1NT  →  East: Pass  →  South: Pass  →  West: Pass
```

**Expected result:**
- Contract is shown as `1NT by North`.
- Phase transitions to PLAYING.
- West (left of declarer) leads first.
- Dummy (South) hand is revealed face-up.

### 6.6 Trigger a passed-out redeal (Session 006 feature)

To test the passed-out redeal, all four players must pass without any bid:

```
North: Pass  →  East: Pass  →  South: Pass  →  West: Pass
```

**Expected result (Session 006 fix):**
- A new board is dealt automatically (board number increments).
- Dealer rotates clockwise to the next player.
- Vulnerability updates for the new board number.
- Bidding starts fresh.
- **Note:** There is currently no visual notification in the UI for the redeal (the `game:passed_out` event is handled server-side and emitted via Socket.io, but the client does not yet display a modal or banner). Refresh the page to confirm the new hand is in place.

### 6.7 Play a trick

After the opening lead, click a legal card to play. Verify:
- [ ] Must-follow-suit enforcement: clicking an off-suit card when you have the led suit is blocked.
- [ ] Trick completes when all 4 players have played.
- [ ] Trick winner leads the next trick.
- [ ] Dummy is played by declarer.

---

## 7. API-Level curl Tests

Use these to verify the backend independently of the UI. Export variables to reuse across commands:

```bash
export BASE="http://localhost:3000"
```

### 7.1 Auth Flow

**Register:**

```bash
curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"tester@example.com","username":"tester","password":"Password123!"}' | jq .
```

Expected: `{"message": "User created successfully"}`

**Login (get session cookie):**

```bash
# NextAuth uses form-based sign-in; obtain CSRF token first
CSRF=$(curl -s "$BASE/api/auth/csrf" | jq -r '.csrfToken')

curl -s -c /tmp/cookies.txt -X POST "$BASE/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=$CSRF&email=tester@example.com&password=Password123!&callbackUrl=$BASE" | head -5

echo "Cookies saved to /tmp/cookies.txt"
```

All subsequent requests that need auth pass `-b /tmp/cookies.txt`.

---

### 7.2 Room Lifecycle

**Create a room:**

```bash
ROOM=$(curl -s -b /tmp/cookies.txt -X POST "$BASE/api/rooms/create" \
  -H "Content-Type: application/json" | jq .)
echo $ROOM
ROOM_ID=$(echo $ROOM | jq -r '.roomId')
INVITE=$(echo $ROOM | jq -r '.inviteCode')
echo "Room: $ROOM_ID  Invite: $INVITE"
```

**Join the room (second user — repeat login flow for second cookie jar):**

```bash
curl -s -b /tmp/cookies2.txt -X POST "$BASE/api/rooms/join" \
  -H "Content-Type: application/json" \
  -d "{\"inviteCode\":\"$INVITE\"}" | jq .
```

**Select a seat:**

```bash
curl -s -b /tmp/cookies.txt -X PATCH "$BASE/api/rooms/$ROOM_ID/seat" \
  -H "Content-Type: application/json" \
  -d '{"seat":"NORTH"}' | jq .
```

**Mark ready:**

```bash
curl -s -b /tmp/cookies.txt -X PATCH "$BASE/api/rooms/$ROOM_ID/ready" \
  -H "Content-Type: application/json" \
  -d '{"isReady":true}' | jq .
```

---

### 7.3 Bid Flow & Passed-Out Redeal

Once all four players are seated, ready, and the game has started, obtain the game ID:

```bash
GAME_STATE=$(curl -s -b /tmp/cookies.txt "$BASE/api/games/$GAME_ID/state")
echo $GAME_STATE | jq '{phase: .phase, dealer: .dealer, boardNumber: .boardNumber}'
```

**Make a bid (1NT):**

```bash
curl -s -b /tmp/cookies.txt -X POST "$BASE/api/games/$GAME_ID/bid" \
  -H "Content-Type: application/json" \
  -d '{"action":"bid","bid":{"level":1,"suit":"NT"}}' | jq .
```

Expected: `{"success": true, "phase": "BIDDING"}`

**Pass:**

```bash
curl -s -b /tmp/cookies.txt -X POST "$BASE/api/games/$GAME_ID/bid" \
  -H "Content-Type: application/json" \
  -d '{"action":"pass"}' | jq .
```

**Test passed-out redeal (all 4 pass — use 4 cookie jars):**

After all four players pass with no bid made, verify the redeal:

```bash
# After 4 passes, check new state
NEW_STATE=$(curl -s -b /tmp/cookies.txt "$BASE/api/games/$GAME_ID/state")
echo $NEW_STATE | jq '{
  phase: .phase,
  boardNumber: .boardNumber,
  dealer: .dealer,
  vulnerability: .vulnerability,
  bidHistory: (.bidHistory | length)
}'
```

**Expected result from Session 006 fix:**

```json
{
  "phase": "BIDDING",
  "boardNumber": 2,
  "dealer": "<rotated from board 1>",
  "vulnerability": "<recalculated for board 2>",
  "bidHistory": 0
}
```

`bidHistory` must be `0` (reset), `boardNumber` must have incremented, and `phase` must be `"BIDDING"`.

**Play a card (once in PLAYING phase):**

```bash
curl -s -b /tmp/cookies.txt -X POST "$BASE/api/games/$GAME_ID/play" \
  -H "Content-Type: application/json" \
  -d '{"card":{"suit":"SPADES","rank":"ACE"}}' | jq .
```

---

## 8. Known Issues & Workarounds

### 8.1 `getNextPlayer` turn order bug

**Symptom:** After winning a trick the wrong player is set as current player.

**Root cause:** `getNextPlayer()` in `app/api/games/[gameId]/bid/route.ts` uses the seat order `['NORTH', 'EAST', 'SOUTH', 'WEST']`. The correct clockwise Bridge order is `NORTH → EAST → SOUTH → WEST`, but within the deal the West seat should follow South (not East following North as sometimes generated). This can produce an off-by-one in trick-leading after unusual bidding sequences.

**Workaround:** For manual testing, follow a standard auction so the opening leader is always the hand to the left of declarer. Avoid testing edge cases around trick-leading order until this is fixed.

**Tracking:** To be addressed in a future session.

---

### 8.2 `game:passed_out` client handler not in UI

**Symptom:** After all four players pass (passed-out board), the UI does not update automatically. The new hand does exist in the database and state is correct server-side, but there is no visual feedback.

**Root cause:** The Socket.io `game:passed_out` event is emitted by the server (Session 006) but the React client does not yet subscribe to it.

**Workaround:** After a passed-out board, manually reload the page (`F5`). The new hand will load correctly from the server state.

**Tracking:** Add `socket.on('game:passed_out', ...)` handler to `app/game/[gameId]/page.tsx` in the next UI session.

---

### 8.3 Supabase free-tier pause

**Symptom:** `DATABASE_URL` connection times out; Prisma throws `Error: Can't reach database server`.

**Root cause:** Supabase pauses free-tier projects after ~1 week of inactivity.

**Workaround:**
1. Go to https://supabase.com/dashboard
2. Open your project.
3. If it shows "Paused", click **Restore project** and wait ~30 s.
4. Re-run `npx prisma db push` to confirm connectivity.

For uninterrupted local development, use a local PostgreSQL instead (e.g. via Docker: `docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16-alpine`).

---

### 8.4 Node.js 24 `NODE_ENV` default

**Symptom:** `npm run test:e2e` fails with auth errors or missing session data when running on Node 24.

**Root cause:** Node 24 defaults `process.env.NODE_ENV` to `"production"` when not explicitly set. NextAuth behaves differently in production mode (stricter cookie settings, HTTPS-only, etc.).

**Workaround:** The Playwright config already sets `NODE_ENV: 'development'` for the web server process. If you run tests manually or in CI on Node 24, prepend:

```bash
NODE_ENV=development npm run test:e2e
```

---

## Quick Reference

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start Next.js + Socket.io in dev mode |
| `npm test` | 123 unit tests (no external deps) |
| `npm run test:socket` | 20 Socket.io tests (no DB) |
| `npm run test:db:start` | Start Docker test-DB on port 5433 |
| `npm run test:db:reset` | Apply schema to test-DB |
| `npm run test:db` | 35 DB integration tests |
| `npm run test:db:stop` | Stop Docker test-DB |
| `npm run build` | TypeScript build — expect 23/23 pages clean |
| `npm run test:e2e` | Playwright E2E (needs live DB) |
| `npm run test:all` | Unit + Socket + DB + E2E in sequence |
| `npx prisma studio` | Browse database at http://localhost:5555 |
| `npx prisma db push` | Sync schema to database |

---

*Generated for Sessions 001–006 · Last updated: 2026-04-26*
