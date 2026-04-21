# Module 09 — Game State Bugs, Defensive Coding, and API Testing

> Session 006 | Prerequisite: Modules 02, 03, 05

---

## The Bug We Found: A Missing Guard in `isBiddingComplete`

The learning doc for Module 02 described this correct implementation:

```typescript
export function isBiddingComplete(history: BidAction[]): boolean {
    if (history.length < 4) return false;
    const lastThree = history.slice(-3);
    const allPasses = lastThree.every(a => a.type === 'pass');
    const hasBidBefore = history.some(a => a.type === 'bid');
    return allPasses && hasBidBefore;
}
```

The actual code in `lib/game/bidding.ts` had drifted:

```typescript
// What was actually in the file — missing hasBidBefore
export function isBiddingComplete(bidHistory: BidAction[]): boolean {
    if (bidHistory.length < 4) return false;
    const lastThree = bidHistory.slice(-3);
    return lastThree.every(action => action.type === 'pass');
}
```

**Why this is dangerous:** With 4 passes and no bid, the bug causes `isBiddingComplete` to return `true`. Downstream, `determineContract` returns `null` (no bid was ever made), and the old code in the bid route had:

```typescript
if (biddingComplete) {
    contract = determineContract(bidHistory);
    if (contract) {
        newPhase = GamePhase.PLAYING;
    } else {
        // All passed, no contract - game ends  ← WRONG
        newPhase = GamePhase.COMPLETED;
    }
}
```

A passed-out board would silently mark the game as `COMPLETED`. Players would see the game end with no contract, no score, and no redeal. The bug was silent — no exception, no visible error.

**Why the test didn't catch it:** The test at `__tests__/unit/bidding.test.ts:211` correctly expected `false` for a passed-out board — but all tests were failing due to an unrelated module import path issue (`biddingEngine` vs `bidding`). A green test suite is only meaningful when all tests actually run.

---

## The Passed-Out Board Rule in Bridge

In duplicate bridge, if all four players pass without any bid being made, the board is **passed out**. The rules:

1. No contract is played. Neither side scores anything.
2. The board is **redealt** — new shuffle, new cards.
3. The dealer rotates to the next seat clockwise.
4. Vulnerability is recalculated based on the new board number.

This is different from a board where there *was* a bid followed by three passes — in that case, the auction is over and the final bid becomes the contract.

**The two functions that handle these two cases:**

```typescript
// Case 1: Auction ended normally (bid + 3 consecutive passes)
export function isBiddingComplete(bidHistory: BidAction[]): boolean {
    if (bidHistory.length < 4) return false;
    const hasBid = bidHistory.some(a => a.type === 'bid');
    const lastThree = bidHistory.slice(-3);
    return hasBid && lastThree.every(action => action.type === 'pass');
}

// Case 2: All 4 players passed with no bid → redeal required
export function isPassedOut(bidHistory: BidAction[]): boolean {
    return (
        bidHistory.length === 4 &&
        bidHistory.every(a => a.type === 'pass')
    );
}
```

**Why two separate functions instead of one?**

They answer different questions. `isBiddingComplete` answers: "Is the auction over with a contract?" `isPassedOut` answers: "Was the board abandoned with no contract?" These are mutually exclusive states that lead to completely different game transitions. Merging them into one function would require a return type like `'complete' | 'passed-out' | false`, which makes the call sites harder to read and reason about.

Separating them keeps each function's purpose clear and its logic provably correct.

---

## Defensive Coding: Test the Boundary, Not the Happy Path

The `isPassedOut` check is placed **before** the `isBiddingComplete` check in the bid route:

```typescript
// Check passed-out FIRST (exits early, no fallthrough)
if (isPassedOut(bidHistory)) {
    // ... redeal and return
}

// Only reaches here if a bid was made
const biddingComplete = isBiddingComplete(bidHistory);
```

**Why order matters:** `isPassedOut` is a subset of the conditions that would naively trigger `isBiddingComplete` (before the fix). By checking it first and returning early, we eliminate an entire class of bugs — even if `isBiddingComplete` were to regress, passed-out boards are already handled before that code runs.

This is the **early return / guard clause** pattern: check the exceptional case first, handle it completely, and return. The remainder of the function can then assume the exceptional case never happened.

```typescript
// Guard clause style — exceptional case first, return early
function handleBid(...) {
    if (isPassedOut(history)) { ... return; }       // exceptional
    if (isBiddingComplete(history)) { ... return; }  // normal end
    // ... normal bid progression
}

// vs. nested if-else — harder to follow which branch handles what
function handleBid(...) {
    if (!isPassedOut(history)) {
        if (isBiddingComplete(history)) {
            ...
        } else {
            ...
        }
    } else {
        ...
    }
}
```

---

## The Redeal: Pure Logic vs. Side Effects Again

The redeal uses the same pure functions from `lib/game/`:

```typescript
// Pure: no DB, no network — just computation
const deck = createDeck();
const shuffled = shuffleDeck(deck);
const hands = dealCards(shuffled);
const sortedHands = {
    NORTH: sortHand(hands.NORTH),
    SOUTH: sortHand(hands.SOUTH),
    EAST:  sortHand(hands.EAST),
    WEST:  sortHand(hands.WEST),
};
const newDealer = getDealerForBoard(nextBoardNumber);
const newVulnerability = calculateVulnerability(nextBoardNumber);

// Side effects: DB write + WebSocket emit — isolated at the boundary
await prisma.game.update({ ... gameState: redealtState ... });
global.io.emit('game:passed_out', { boardNumber, dealer, vulnerability });
```

**DSA connection:** This is the same separation of concerns from Module 02, applied at the API layer. Pure computation (deck generation, vulnerability lookup) is kept separate from I/O (database write, WebSocket broadcast). This means if the redeal logic ever needs to be tested, you can test `createDeck → shuffleDeck → dealCards → getDealerForBoard → calculateVulnerability` without any mock database or socket server.

---

## API Testing Without a Browser

When Playwright's E2E tests are blocked (missing system library in WSL2), you can still verify the full app flow using `curl` against the running dev server.

### Session management with curl

NextAuth requires a CSRF token before accepting a login POST:

```bash
# Step 1: Get CSRF token (also sets cookie)
CSRF=$(curl -s -c cookies.txt http://localhost:3000/api/auth/csrf \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")

# Step 2: Login with CSRF token in body
curl -X POST http://localhost:3000/api/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -c cookies.txt -b cookies.txt \
  -d "csrfToken=$CSRF&email=player1@test.com&password=Test1234!"

# Step 3: All subsequent requests use the session cookie
curl http://localhost:3000/api/auth/session -b cookies.txt
```

**Why `-c` and `-b` together?** `-c cookies.txt` writes cookies received from the server (like the session cookie) to the file. `-b cookies.txt` sends cookies from the file back on each request. Using both makes curl behave like a browser's cookie jar.

### Testing the passed-out board flow

```bash
# 4 passes in turn order (NORTH → EAST → SOUTH → WEST when NORTH deals)
# Each pass uses the cookie file for that player's session
curl -X POST .../api/games/$GAME_ID/bid -b cookies2.txt -d '{"action":"pass"}'
curl -X POST .../api/games/$GAME_ID/bid -b cookies3.txt -d '{"action":"pass"}'
curl -X POST .../api/games/$GAME_ID/bid -b cookies1.txt -d '{"action":"pass"}'
curl -X POST .../api/games/$GAME_ID/bid -b cookies4.txt -d '{"action":"pass"}'

# Expected response on the 4th pass:
# { "success": true, "passedOut": true, "boardNumber": 2 }

# Verify game state was reset:
curl .../api/games/$GAME_ID -b cookies1.txt
# Expected: { phase: "BIDDING", boardNumber: 2, bidHistory: [], dealer: "player3" }
```

This is a **regression test script**: if the bug ever returns, running these curl commands will immediately show the wrong `boardNumber` or `phase: "COMPLETED"`.

---

## What "Characterisation Test" Means in Practice

Module 02 introduced the term for the `getNextPlayer` turn-order bug. This session saw the same idea applied differently: the test at `__tests__/unit/bidding.test.ts:211` was a **specification test** — it asserted the correct intended behaviour (`isPassedOut → false from isBiddingComplete`), not the current wrong behaviour.

The difference matters:

| Type | What it asserts | What happens when you fix the bug |
|---|---|---|
| Characterisation test | Current (wrong) behaviour | Test fails — signals "you changed this" |
| Specification test | Intended (correct) behaviour | Test passes — confirms bug is fixed |

Both have value. A characterisation test prevents accidental change; a specification test drives you toward correctness. When a spec test is already written (as it was here), fixing the bug is straightforward: make the code satisfy the spec.

---

## Summary: DSA and Engineering Concepts

| Concept | Applied Where |
|---|---|
| Guard clause / early return | `isPassedOut` checked before `isBiddingComplete` in bid route |
| Separation: pure vs. effectful | Redeal uses pure game functions; DB write/emit isolated at boundary |
| Mutually exclusive state transitions | `isPassedOut` and `isBiddingComplete` handle non-overlapping cases |
| Specification test vs. characterisation test | `bidding.test.ts:211` was a spec test driving the fix |
| curl as a regression test harness | Manual API flow verification when browser tests are blocked |

---

**Next:** [Module 10 — Client-Side State & WebSocket Event Handling](./10-client-state-websocket.md) *(upcoming)*
