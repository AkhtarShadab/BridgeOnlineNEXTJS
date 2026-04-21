# Session 006 — Passed-Out Board Fix & End-to-End Testing

**Date:** 2026-04-21
**Branch:** master

---

## What We Did

### 1. Discovered a bug in `isBiddingComplete`

While reviewing `docs/learning/02-game-logic-pure-functions.md`, the learning doc described a correct implementation of `isBiddingComplete` that included a `hasBidBefore` guard. The actual code in `lib/game/bidding.ts` was missing it:

```typescript
// Bug — missing hasBidBefore check
export function isBiddingComplete(bidHistory: BidAction[]): boolean {
    if (bidHistory.length < 4) return false;
    const lastThree = bidHistory.slice(-3);
    return lastThree.every(action => action.type === 'pass');
}
```

With 4 passes and no bid, `length >= 4` and all three of the last actions are passes → the function returned `true` incorrectly, treating a passed-out board as a completed auction. The existing test at `__tests__/unit/bidding.test.ts:211` already asserted this should return `false` — that test would have failed once module import issues were resolved.

### 2. Fixed `isBiddingComplete` and added `isPassedOut`

**`lib/game/bidding.ts`:**

```typescript
export function isBiddingComplete(bidHistory: BidAction[]): boolean {
    if (bidHistory.length < 4) return false;
    const hasBid = bidHistory.some(a => a.type === 'bid');
    const lastThree = bidHistory.slice(-3);
    return hasBid && lastThree.every(action => action.type === 'pass');
}

export function isPassedOut(bidHistory: BidAction[]): boolean {
    return (
        bidHistory.length === 4 &&
        bidHistory.every(a => a.type === 'pass')
    );
}
```

### 3. Wired the redeal into the bid API route

**`app/api/games/[gameId]/bid/route.ts`** — Before the existing `isBiddingComplete` check, the route now calls `isPassedOut`. On a passed-out board:

- Increments board number
- Recalculates dealer (`getDealerForBoard`) and vulnerability (`calculateVulnerability`)
- Shuffles a fresh deck and deals new hands
- Resets `gameState` to a clean BIDDING state
- Emits `game:passed_out` over WebSocket so clients can reset their UI
- Returns early with `{ passedOut: true, boardNumber: N }`

The old code had an `else { newPhase = COMPLETED }` branch that would silently mark the game as finished when `determineContract` returned `null` — this has been removed because `isBiddingComplete` now correctly returns `false` for passed-out boards, and the `isPassedOut` branch handles that case explicitly.

---

## Tests Run

| Suite | Tests | Result |
|---|---|---|
| Unit (vitest) | 123 | Pass |
| Socket integration | 20 | Pass |
| DB integration (local Docker) | 35 | Pass |
| E2E (Playwright) | 20 | Blocked — missing `libnspr4.so` in WSL2 |

To unblock E2E: `sudo npx playwright install-deps chromium`

---

## API Flow Verified Manually

### Register + Login
```
POST /api/auth/register       → { success: true, user: { id, email, username } }
POST /api/auth/callback/credentials → 302 redirect, session cookie set
GET  /api/auth/session        → { user: { id, name, email }, expires }
```

### Room lifecycle
```
POST /api/rooms/create        → { roomId, inviteCode }
POST /api/rooms/join          → { success: true, room: { players: [...] } }
PATCH /api/rooms/[id]/ready   → { success: true, isReady: true }
POST /api/rooms/[id]/start    → { success: true, gameId }
```

### Normal auction (bid + 3 passes)
```
POST /api/games/[id]/bid  { action:"bid", bid:{level:1,suit:"S"} }
POST /api/games/[id]/bid  { action:"pass" }  ×3
→ { biddingComplete: true, contract: { suit:"S", level:1, declarer:... }, nextPhase:"PLAYING" }
```

### Passed-out board (4 passes, no bid)
```
POST /api/games/[id]/bid  { action:"pass" }  ×4
→ { passedOut: true, boardNumber: 2 }

GET  /api/games/[id]
→ { phase:"BIDDING", boardNumber:2, dealer:"player3", bidHistory:[], vulnerability:{NS:true,EW:false} }
```

Board number advanced, dealer rotated to next seat (EAST for board 2), vulnerability recalculated (NS vulnerable), bid history cleared, fresh hands dealt.

---

## Known Issues Left Open

- **E2E tests blocked by missing system lib** — requires `sudo npx playwright install-deps chromium` in WSL2 terminal
- **Supabase dev DB paused** — free-tier inactivity pause; log into Supabase dashboard to unpause; `.env.local` added to point dev server at local test container in the meantime
- **`getNextPlayer` turn order bug** — documented known bug in `lib/game/gameEngine.ts` (N→S→E→W instead of N→E→S→W), tracked with characterisation test; not fixed this session
- **`game:passed_out` client handler** — server emits the event correctly; client UI still needs to listen and reset the bidding panel

---

## Files Changed

```
lib/game/bidding.ts                         — isBiddingComplete fix + isPassedOut
app/api/games/[gameId]/bid/route.ts         — redeal path for passed-out boards
.env.local                                  — local DB override (gitignored)
```
