# Module 11 — Full Game Simulation & Play Route Bug Fixes

> Session 008 | Prerequisite: Module 10 (E2E Integration)

---

## What We Built

A complete end-to-end 4-player game simulation script that runs against the local Docker test DB without Playwright — using raw HTTP + cookie jars. The script exercises every phase of the game lifecycle:

1. Register 4 players
2. Login via NextAuth credentials (CSRF token → form-encoded callback)
3. Create a room
4. Players 2–4 join via invite code
5. Seat selection (NORTH/EAST/WEST/SOUTH)
6. All 4 players mark ready → room auto-transitions to READY
7. Creator starts the game
8. Bidding: dealer bids 1NT, next 3 pass → contract set
9. Card play: 13 tricks (always play first card in hand)
10. Verify final phase = COMPLETED and trick counts

**Location:** `__tests__/simulation/full-game-simulation.mjs`

---

## Bug 1: Play Route Reading Hands From Wrong Field

### Root Cause

`initializeGame()` stores per-seat card hands in two places:

| Field | Contents | Format |
|---|---|---|
| `gameState.hands` | Per-seat hands as dealt | Card objects `{suit, rank}` |
| `deck` | Original shuffled deck | Flat string array `["AS","KH",...]` |

The play route (`app/api/games/[gameId]/play/route.ts`) had:

```typescript
// WRONG — game.deck is a flat array, not a per-seat object
const hands = game.deck as any;
const currentHand = hands[currentPlayerSeat] || [];
// → currentHand was always [] since arrays don't have NORTH/EAST/SOUTH/WEST keys
// → Every card play failed with "Card not in your hand"
```

### Fix

Read hands from `gameState.hands` and write back to `gameState.hands`:

```typescript
// CORRECT — gameState.hands is {NORTH: [...], SOUTH: [...], EAST: [...], WEST: [...]}
const gameState = game.gameState as any;
const hands: Record<string, string[]> = { ...(gameState.hands || {}) };

const currentHand = hands[currentPlayerSeat] || [];
// ... validate and remove card ...
const updatedHand = currentHand.filter((c: string) => c !== card);
hands[currentPlayerSeat] = updatedHand;

const updatedGameState = {
  ...gameState,
  hands,            // persist updated hands back into gameState
  currentTrick: ...,
  tricks,
};

await prisma.game.update({
  data: { gameState: updatedGameState, ... },
});
```

### Secondary Fix: Final Trick Not Saved

When the 13th trick completes, the code took an early return path that saved only the game status (COMPLETED) but **not** the final `gameState`. This meant the DB had only 12 tricks in `gameState.tricks` after the game ended.

Fix: save `finalGameState` (with all 13 tricks) in the same update that sets COMPLETED:

```typescript
if (tricks.length === 13) {
  const finalGameState = { ...gameState, hands, currentTrick: [], tricks };
  await prisma.game.update({
    data: {
      gameState: finalGameState,   // ← was missing before
      phase: GamePhase.COMPLETED,
      endedAt: new Date(),
    },
  });
  return NextResponse.json({ success: true, card, trickComplete: true, gameComplete: true, score });
}
```

---

## Bug 2: Card Objects vs Card Strings (Type Mismatch)

### Root Cause

The codebase has **two different Card types**:

| File | Type | Format |
|---|---|---|
| `lib/game/cardUtils.ts` | `Card = {suit: Suit, rank: Rank}` | Object |
| `lib/constants/cards.ts` | `Card = \`${Rank}${Suit}\`` | String like `"AS"` |

`initializeGame()` uses `cardUtils.ts` → stored `{suit, rank}` objects in `gameState.hands`.

The play route uses `constants/cards.ts` → expected string cards like `"AS"`.

The `isValidPlay()` function also uses string cards (index access: `card[1]` for suit, `hand.some(c => c[1] === led)`).

Result: `currentHand.includes("AS")` was always `false` because the hand stored `{suit: 'S', rank: 'A'}` objects.

### Fix

Convert hands to string format at the point of creation in `gameEngine.ts`:

```typescript
// BEFORE — stored Card objects
const sortedHands = {
  NORTH: sortHand(hands.NORTH),   // Card[] of objects
  ...
};

// AFTER — stored as strings, matching what the play route expects
const sortedHands = {
  NORTH: sortHand(hands.NORTH).map(cardToString),   // string[] like ["AS","KH",...]
  ...
};
```

**Rule:** Pick one canonical format for cards-at-rest in the DB and stick to it. String format wins because the play API accepts strings and `isValidPlay` operates on strings.

---

## API Field Mapping Pitfalls (GET /api/games/[gameId])

When writing simulation or test code against this API, the response shape differs from what you might assume:

| You might write | Actual field name | Value type |
|---|---|---|
| `g.currentPlayerId` | `g.currentPlayer` | `{id, username}` object |
| `g.gamePlayers` | `g.players` | `[{userId, seat, username, avatarUrl}]` |
| `g.gameState.hands[seat]` | `g.hand` | Requesting player's own hand only |
| `g.gameState.contract` | `g.contract` | Top-level field |
| `g.gameState.tricks` | `g.tricks` | Top-level field |
| `g.gameState.dealer` | `g.dealer` | `{id, username}` User object |

**Critical:** The GET endpoint only returns the **requesting player's own hand** (`hand` field). To get EAST's hand, you must fetch with EAST's session cookie. In the simulation this means:

```javascript
// Get current player's identity (fetch with any player's jar)
const { data: gCur } = await apiFetch('GET', `/api/games/${gameId}`, undefined, players[0].jar);
const curId = gCur.currentPlayer?.id;
const pidx  = uidToIdx[curId];

// Fetch with current player's own jar to get their hand
const { data: gN } = await apiFetch('GET', `/api/games/${gameId}`, undefined, players[pidx].jar);
const card = gN.hand[0];   // Their own first card
```

---

## Declarer-Plays-For-Dummy Logic

After the first card of a trick is played, the dummy's hand is visible. The declarer plays cards for the dummy. The play route handles this:

```typescript
// Must be current player's turn (or declarer playing for dummy)
const isDummyTurn = dummySeat && game.gamePlayers.find(p => p.seat === dummySeat)?.userId === game.currentPlayerId;
const isDeclarerPlayingForDummy = game.declarerId === session.user.id && isDummyTurn;

if (!isPlayerTurn && !isDeclarerPlayingForDummy) {
  return NextResponse.json({ error: 'Not your turn' }, { status: 400 });
}
```

In the simulation, when it's the dummy's turn, the request must be made with the **declarer's** session jar (not the dummy's):

```javascript
// When currentPlayerId is dummy's userId, the declarer submits the card
const dummyUserId = Object.keys(uidToSeat).find(uid => uidToSeat[uid] === dummySeat);
const isForDummy = curId === dummyUserId;
const submitterIdx = isForDummy ? uidToIdx[declarerId] : pidx;
```

---

## Simulation Architecture: Why Native Fetch + Cookie Jars

The simulation uses Node.js's native `fetch` + a `Map` as a cookie jar, without any testing framework. This gives:

- **Full HTTP round-trips** — every API call goes through the actual Next.js routing, auth middleware, and DB layer
- **No browser overhead** — faster than Playwright for pure API testing
- **No vitest/jest dependency** — runnable standalone with `node simulation.mjs`
- **Real session cookies** — tracks `next-auth.session-token` across requests

```javascript
// Cookie jar pattern — a Map from name → value
const jar = new Map();

function captureCookies(res, jar) {
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(';');
    const eqIdx = pair.indexOf('=');
    const name = pair.slice(0, eqIdx).trim();
    const val  = pair.slice(eqIdx + 1).trim();
    if (name) jar.set(name, val);
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k,v]) => `${k}=${v}`).join('; ');
}
```

Each player gets their own `Map()` cookie jar. HTTP requests attach their jar via the `Cookie:` header and update it from `Set-Cookie:` responses.

---

## NextAuth Credentials Login Flow

The login is a 5-step sequence:

```
1. POST /api/auth/register           → creates user, returns 201
2. GET  /api/auth/csrf               → returns { csrfToken }
3. POST /api/auth/callback/credentials  (form-encoded, manual redirect)
     body: email=...&password=...&csrfToken=...&callbackUrl=...&json=true
   → responds 302 with Location header
4. GET  <redirected location>        → captures session cookie
5. GET  /api/auth/session            → verify session, get userId
```

The `csrfToken` step is mandatory — submitting credentials without it returns a 403 CSRF mismatch.

The `redirect: 'manual'` option is critical for steps 3 and 4 so that fetch doesn't auto-follow the redirect (which would consume the `Set-Cookie` response before we can capture it).

---

## Running the Simulation Locally

Prerequisites:

```bash
# 1. Docker test DB must be running
npm run test:db:start

# 2. All dev dependencies must be installed (tailwindcss is a devDep)
npm install --include=dev

# 3. Clear any stale Next.js cache after dep changes
rm -rf .next

# 4. Start the dev server with test DB env vars
DATABASE_URL="postgresql://test:test@localhost:5433/bridgeonline_test?schema=public" \
NEXTAUTH_SECRET="test-secret-32-chars-for-testing!!" \
NEXTAUTH_URL="http://localhost:3000" \
NODE_ENV="development" \
node server/index.js &

# 5. Warm up the server (first request triggers Turbopack compilation)
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"warmup@t.com","username":"warmup","password":"Password123!","confirmPassword":"Password123!"}' \
  -o /dev/null

# 6. Run simulation
node __tests__/simulation/full-game-simulation.mjs
```

**Why the warm-up curl?** Next.js dev mode compiles routes on first request via Turbopack. The first request to `/api/auth/register` can take 2–5 seconds while Turbopack compiles `globals.css` (which requires `tailwindcss`). Without the warm-up, the first simulated player registration races this compilation and may get a 500. The warm-up saturates the compilation before the simulation starts.

---

## Summary

| Bug | Root Cause | Fix |
|---|---|---|
| "Card not in your hand" on every play | Play route read `game.deck` (flat array) not `gameState.hands` | Change to `const hands = { ...(gameState.hands || {}) }` |
| 13th trick not saved to gameState | Early return path missed `gameState` update on game completion | Add `gameState: finalGameState` to the COMPLETED update |
| "Expected string, received object" for card | `initializeGame` stored Card objects; play route expected strings | Convert with `.map(cardToString)` at deal time in `gameEngine.ts` |
| `currentPlayerId` undefined in simulation | GET response returns `currentPlayer: {id,username}` not `currentPlayerId` | Use `g.currentPlayer?.id` |
| `gamePlayers` undefined in simulation | GET response returns `players` array not `gamePlayers` | Use `g.players ?? []` |
| Empty hand in simulation | Fetching with wrong player's session (GET returns own hand only) | Fetch with current player's own jar to get their `hand` field |

---

**Next:** Module 12 — Reconnection Protocol & 30-Second Grace Period *(upcoming)*
