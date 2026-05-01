# 12 — Turn Order Bug Fix & game:passed_out Client Handler

**Date:** 2026-04-28
**Tasks covered:**
- Fix `getNextPlayer` turn order bug (N→E→S→W clockwise) — ✅ Done
- Implement `game:passed_out` client handler in UI — 📋 Todo

---

## Part 1: getNextPlayer Turn Order Bug Fix

### What Was Wrong

`getNextPlayer` in `lib/game/playing.ts` used the seat rotation order:

```
north → south → east → west → north
```

This is **incorrect**. Bridge is played clockwise around the table:

```
North
West    East
South
```

The correct clockwise order is **North → East → South → West → North**.

The bug meant that after North played a card, the game prompted **South** instead of **East** — completely wrong seating logic for trick-taking.

### The Fix

**File:** `lib/game/playing.ts`

```diff
- const seatOrder = ['north', 'south', 'east', 'west'] as const;
+ const seatOrder = ['north', 'east', 'south', 'west'] as const;
```

One line change. The rest of the function (index lookup + modulo wrap) was already correct — only the order array was wrong.

### Test Updates

**File:** `__tests__/unit/playing.test.ts`

The existing tests were written to match the buggy implementation. They were updated to assert the correct clockwise rotation:

| Old (wrong) | New (correct) |
|---|---|
| north → south | north → east |
| south → east | east → south |
| east → west | south → west |
| west → north | west → north (unchanged) |

All 5 `getNextPlayer` test cases were updated with clearer descriptions (`"clockwise"` suffix added).

### Verification

```bash
npm test
# → 123/123 passing ✅
```

### Key Takeaway

When modelling a physical card table in code, always draw the seating diagram first:

```
      North
West         East
      South
```

Clockwise from North: **N → E → S → W**. A simple array like `['N','S','E','W']` looks "alphabetical" but is spatially wrong. The bug survived undetected because unit tests were written against the implementation rather than the game rules.

---

## Part 2: game:passed_out Client Handler (Todo)

### Context

A **passed-out board** occurs when all 4 players pass without any bid. Under Bridge rules, the board is thrown out and redealt — no score is recorded.

### What the Server Already Does (Session 006)

`app/api/games/[gameId]/bid/route.ts` detects a passed-out board and:

1. Increments the board number
2. Recalculates dealer and vulnerability
3. Deals a fresh set of hands
4. Resets `gameState` to `BIDDING`
5. Emits a `game:passed_out` Socket.io event with the new board data

The server side is **complete**. The client has no handler for this event yet.

### What Needs to Be Built

**Where to add it:** Wherever other Socket.io client listeners are registered (search for `socket.on(` in the frontend components).

**Handler logic:**

```typescript
socket.on('game:passed_out', (data: {
  boardNumber: number;
  dealer: string;
  vulnerability: string;
  hands: Record<string, Card[]>;
}) => {
  // 1. Show a notification
  toast('Board passed out — redealing...');

  // 2. Reset bidding state
  setBidHistory([]);
  setCurrentBid(null);
  setCurrentBidder(data.dealer);

  // 3. Update board metadata
  setBoardNumber(data.boardNumber);
  setDealer(data.dealer);
  setVulnerability(data.vulnerability);

  // 4. Update hands with newly dealt cards
  setHand(data.hands[myPosition]);
});
```

### Why It Matters

Without this handler:
- The UI freezes — players see the old bidding panel with no prompts
- The server has moved to a new board but the client is stuck on the old state
- Players have no idea a redeal happened

### Testing the Handler (Once Built)

**Manual test:**
1. Start a 4-player game
2. Have all 4 players pass (P P P P)
3. Confirm:
   - A toast/notification appears: *"Board passed out — redealing..."*
   - Bidding panel resets (empty bid history)
   - Board number increments by 1
   - New hands are displayed for all 4 players

**E2E test to add** (`__tests__/e2e/full-game.spec.ts`):

```typescript
test('passed-out board triggers redeal UI', async ({ page }) => {
  // ... setup 4 players in game ...
  // All 4 players pass
  for (const playerPage of playerPages) {
    await playerPage.click('[data-bid="pass"]');
  }
  // Assert notification visible
  await expect(page.locator('[data-testid="toast"]')).toContainText('passed out');
  // Assert board number incremented
  await expect(page.locator('[data-testid="board-number"]')).toContainText('2');
});
```

### Key Takeaway

When adding a Socket.io event on the server, **always** add the client handler in the same PR/session. A server-only event is a silent failure — the UI breaks in ways that are hard to debug because no error is thrown, the socket message just disappears into the void.

Pattern to follow:
```
Server emits event  →  Client registers handler  →  UI updates reactively
```

---

## Summary

| Item | Status | File(s) Changed |
|---|---|---|
| `getNextPlayer` clockwise fix | ✅ Done | `lib/game/playing.ts`, `__tests__/unit/playing.test.ts` |
| `game:passed_out` client handler | 📋 Todo | Frontend socket listener file, `__tests__/e2e/full-game.spec.ts` |
