# Testing Guide — BridgeOnline

This guide covers all 5 testing layers: unit tests, DB integration, Socket.io integration, E2E browser flows, and WebRTC signaling.

---

## Layer Summary

| Layer | Command | Needs | Tests |
|---|---|---|---|
| **1 — Unit** | `npm test` | Nothing | 123 |
| **2 — DB** | `npm run test:db` | Docker test DB | ~35 |
| **3 — Socket.io** | `npm run test:socket` | Nothing | 20 |
| **4 — E2E** | `npm run test:e2e` | App + Playwright system deps | 20 |
| **5 — Voice** | included in `test:e2e` | App + Playwright system deps | 3 |

---

## Prerequisites

```bash
npm install
```

### Layer 1 + 3 — No external dependencies
Pure in-memory logic and standalone Socket.io server. No database, no browser.

### Layer 2 — Docker PostgreSQL
```bash
# Add yourself to the docker group (one-time):
sudo usermod -aG docker $USER   # then log out/in

# Start test DB and push schema:
npm run test:db:start
```

### Layer 4 + 5 — Playwright system libraries + Docker DB

E2E tests start the full app (`npm run dev`) and run real browser flows. They need:

1. **Playwright system libraries** (one-time, requires sudo):
```bash
sudo npx playwright install-deps chromium
npx playwright install chromium
```

2. **Docker test DB must be running** — the app connects to `localhost:5433` (same DB as Layer 2):
```bash
npm run test:db:start    # start postgres:16-alpine on port 5433
npx prisma db push --skip-generate   # push schema to test DB (first time)
```

3. **Node.js ≥ 24 compatibility** — Node 24 defaults `process.env.NODE_ENV` to `"production"`
when not set. `playwright.config.ts` now explicitly passes `NODE_ENV: 'development'` to the
webServer process so Next.js starts in dev mode instead of looking for a production build.
This is handled automatically — no manual action needed.

---

## Running the Tests

### Run once (CI mode)

```bash
npm test
```

**Expected output:**

```
 RUN  v4.1.4 /path/to/BridgeOnline

 Test Files  5 passed (5)
      Tests  123 passed (123)
   Start at  16:45:59
   Duration  1.78s
```

---

### Run with verbose output (see every test name)

```bash
npm test -- --reporter=verbose
```

**Sample output:**

```
✓ __tests__/unit/scoring.test.ts > partscore bonuses (trick score < 100) > 1NT made exactly: 40 trick + 50 partscore = 90   1ms
✓ __tests__/unit/scoring.test.ts > game bonuses (trick score ≥ 100) > 3NT made: 100 trick + 300 (not vul) = 400             1ms
✓ __tests__/unit/scoring.test.ts > small slam bonus (level 6) > 6♠ not vul: 180 + 300 + 500 = 980                          1ms
✓ __tests__/unit/bidding.test.ts > validateBid — DOUBLE > rejects double of own partner's bid                               1ms
✓ __tests__/unit/playing.test.ts > determineTrickWinner > a trump card beats the highest card of led suit                   7ms
```

Each line is: `✓/✗  file > describe block > test name   duration`

---

### Watch mode (re-runs on file save)

```bash
npm run test:watch
```

Useful while editing game logic. Vitest re-runs only the affected test file on each save.

---

### Run a single test file

```bash
npm test -- __tests__/unit/scoring.test.ts
npm test -- __tests__/unit/bidding.test.ts
npm test -- __tests__/unit/playing.test.ts
npm test -- __tests__/unit/deck.test.ts
npm test -- __tests__/unit/cardUtils.test.ts
```

---

### Run tests matching a name pattern

```bash
# Only scoring tests that mention "slam"
npm test -- --reporter=verbose -t "slam"

# Only bidding tests that mention "double"
npm test -- --reporter=verbose -t "double"

# Only trick winner tests
npm test -- --reporter=verbose -t "determineTrickWinner"
```

**Sample output for `-t "slam"`:**

```
✓ small slam bonus (level 6) > 6♠ not vul: 180 + 300 + 500 = 980     1ms
✓ small slam bonus (level 6) > 6♠ vulnerable: 180 + 500 + 750 = 1430 1ms
✓ grand slam bonus (level 7) > 7NT not vul: 220 + 300 + 1000 = 1520  1ms
✓ grand slam bonus (level 7) > 7NT vulnerable: 220 + 500 + 1500 = 2220 1ms
```

---

### Coverage report

```bash
npm run test:coverage
```

Opens a summary table in the terminal and writes a full HTML report to `coverage/index.html`.

**Sample terminal output:**

```
 % Stmts  | % Branch | % Funcs  | % Lines  | File
----------|----------|----------|----------|-----------------------------
   98.50  |   95.12  |  100.00  |   98.50  | lib/game/scoring.ts
   96.77  |   93.33  |  100.00  |   96.77  | lib/game/bidding.ts
  100.00  |  100.00  |  100.00  |  100.00  | lib/game/deck.ts
```

Open the HTML report in a browser for line-by-line highlighting:

```bash
# Linux / WSL
explorer.exe coverage/index.html
```

---

## What Each Test File Covers

### `__tests__/unit/scoring.test.ts` — ACBL Duplicate Scoring

Tests the `calculateScore()` function against the official ACBL scoring table.

**Input shape:**
```ts
calculateScore(
  contract: { level, suit, doubled, redoubled },
  tricksWon: number,
  declarer: 'NS' | 'EW',
  vulnerability: { NS: boolean, EW: boolean }
)
```

**Output shape:**
```ts
{
  scoreNS: number,
  scoreEW: number,
  breakdown: {
    trickScore, overtricks, gameBonus, slamBonus, doubleBonus, penalty
  }
}
```

**Example — 3NT made, not vulnerable:**

| Input | Value |
|---|---|
| `level` | 3 |
| `suit` | `'NT'` |
| `doubled` | false |
| `tricksWon` | 9 |
| `declarer` | `'NS'` |
| `vulnerability.NS` | false |

| Output | Value |
|---|---|
| `scoreNS` | **400** |
| `breakdown.trickScore` | 100 |
| `breakdown.gameBonus` | 300 |
| `breakdown.slamBonus` | 0 |

**Example — 1♠ doubled, down 2, not vulnerable:**

| Input | Value |
|---|---|
| `level` | 1 |
| `suit` | `'S'` |
| `doubled` | true |
| `tricksWon` | 5 (needed 7, down 2) |
| `vulnerability.NS` | false |

| Output | Value |
|---|---|
| `scoreNS` | **-300** |
| `breakdown.penalty` | 300 |

**ACBL undertrick table tested (doubled, not vulnerable):**

| Down | Score |
|---|---|
| 1 | -100 |
| 2 | -300 |
| 3 | -500 |
| 4 | -800 |

---

### `__tests__/unit/bidding.test.ts` — Bid Validation & Auction Rules

Tests `isBidHigher`, `validateBid`, `isBiddingComplete`, `determineContract` from `lib/game/biddingEngine.ts`.

**`isBidHigher` — example inputs/outputs:**

| `newBid` | `currentBid` | Returns |
|---|---|---|
| `{ level: 1, suit: 'C' }` | `null` | `true` (first bid) |
| `{ level: 2, suit: 'C' }` | `{ level: 1, suit: 'NT' }` | `true` (higher level) |
| `{ level: 1, suit: 'NT' }` | `{ level: 2, suit: 'C' }` | `false` (lower level) |
| `{ level: 1, suit: 'H' }` | `{ level: 1, suit: 'D' }` | `true` (same level, H > D) |
| `{ level: 1, suit: 'C' }` | `{ level: 1, suit: 'D' }` | `false` (same level, C < D) |

**`isBiddingComplete` — example sequences:**

| Bid history | Returns |
|---|---|
| `[BID, PASS, PASS]` | `false` (only 2 passes) |
| `[PASS, PASS, PASS, PASS]` | `false` (no bid was made) |
| `[BID(1S), PASS, PASS, PASS]` | `true` |
| `[BID, BID, PASS, PASS, BID, PASS, PASS, PASS]` | `true` |

**`determineContract` — declarer rule:**

NORTH bids 1♠ first, then SOUTH bids 2♠. The contract is 2♠ but the **declarer is NORTH** (first of the partnership to bid spades).

---

### `__tests__/unit/playing.test.ts` — Card Play Rules & Trick Winner

Tests `isValidPlay`, `determineTrickWinner`, `getNextPlayer` from `lib/game/playing.ts`.

**`isValidPlay` — example inputs/outputs:**

| Hand | Card played | Trick so far | Trump | Valid? | Reason |
|---|---|---|---|---|---|
| `['AS','KH','2C']` | `'QD'` | `[]` | `'S'` | ❌ | Card not in hand |
| `['AS','KH','2C']` | `'AS'` | `[]` | `'S'` | ✅ | Opening lead, any card valid |
| `['KS','2H']` | `'2H'` | `[AS led]` | `'H'` | ❌ | Has spades, must follow |
| `['2H','3D']` | `'2H'` | `[AS led]` | `'H'` | ✅ | Void in spades, can play anything |

**`determineTrickWinner` — example tricks:**

```
Trick: AS(p1), KS(p2), 2S(p3), QS(p4) | Trump: H
→ Winner: p1  (AS is highest spade, no trump played)

Trick: AS(p1), 2H(p2), KS(p3), QS(p4) | Trump: H
→ Winner: p2  (2H is trump, beats Ace of led suit)

Trick: AS(p1), 2H(p2), KH(p3), QS(p4) | Trump: H
→ Winner: p3  (KH is highest trump)

Trick: KS(p1), AD(p2), 2S(p3), AC(p4) | Trump: H
→ Winner: p1  (off-suit aces don't win, KS is highest of led suit)
```

---

### `__tests__/unit/deck.test.ts` — Deck Generation & Dealing

Tests `generateDeck`, `shuffleDeck`, `dealCards`, `sortHand` from `lib/game/deck.ts` (string card format).

**Card format used here:** `"${Rank}${Suit}"` e.g. `"AS"` = Ace of Spades, `"TH"` = Ten of Hearts, `"2C"` = 2 of Clubs.

**Key assertions:**
- `generateDeck()` → exactly 52 unique strings
- `dealCards()` → `{ north, south, east, west }` each with exactly 13 cards, union = 52 unique cards
- `shuffleDeck()` → does not mutate the original array
- `sortHand(['2S','AS','KS','5S'])` → `['AS','KS','5S','2S']` (descending within suit)

---

### `__tests__/unit/cardUtils.test.ts` — Object Card System

Tests the object-based `{ rank, suit }` card system in `lib/game/cardUtils.ts`.

**Card format used here:** `{ rank: Rank, suit: Suit }` where Rank ∈ `2–9,T,J,Q,K,A` and Suit ∈ `S,H,D,C`.

**`stringToCard` / `cardToString` roundtrip:**

```
"AS"  →  { rank: 'A', suit: 'S' }  →  "AS"   ✓
"TH"  →  { rank: 'T', suit: 'H' }  →  "TH"   ✓
"2C"  →  { rank: '2', suit: 'C' }  →  "2C"   ✓
"1S"  →  throws (invalid rank)
"AX"  →  throws (invalid suit)
"ACE" →  throws (wrong length)
```

**`getRankValue` outputs:**

| Rank | Value |
|---|---|
| `'2'` | 2 |
| `'T'` | 10 |
| `'J'` | 11 |
| `'Q'` | 12 |
| `'K'` | 13 |
| `'A'` | 14 |

---

## Reading a Failing Test

If you introduce a bug (e.g. change the partscore bonus from 50 to 40), the output will look like:

```
❯ __tests__/unit/scoring.test.ts > partscore bonuses > 1NT made exactly: 40 trick + 50 partscore = 90

AssertionError: expected 80 to equal 90

  - Expected  "90"
  + Received  "80"

  at __tests__/unit/scoring.test.ts:24:28
```

The line number points directly to the failing `expect()` call in the test file.

---

## Known Issue Documented in Tests

`getNextPlayer` in `playing.ts` uses the seat order `north → south → east → west`.
The correct Bridge clockwise order is `north → east → south → west`.
This is noted in `playing.test.ts` with a comment — the test currently asserts the **implemented** behaviour so a future fix will be caught immediately.

---

---

## Layer 2 — DB Integration Tests

**Setup:**
```bash
npm run test:db:start          # starts postgres:16-alpine on port 5433
npm run test:db                # globalSetup runs prisma db push, then tests
npm run test:db:stop           # stop container when done
```

**What's tested:**
- User creation, uniqueness constraints, bcrypt validation
- Friendship requests and status transitions
- Room creation, seat uniqueness, ready toggle, status transitions
- Game record creation, move sequencing, result persistence
- Hand isolation (each player only gets 13 cards, no overlaps)

---

## Layer 3 — Socket.io Integration Tests

```bash
npm run test:socket
```

**What's tested (20 tests):**
- `room:join` — other members notified, sender not echoed
- `room:leave` — remaining members notified
- `room:seat_changed` — broadcast to others, not sender
- `room:ready_toggle` — ready status relay
- `room:settings_updated` — broadcast to ALL including sender
- `game:join` — subscribe to both room and game channels
- `game:make_bid` — broadcast to all, includes sender socketId
- `game:play_card` — 4-player sequence test
- `voice:offer/answer/ice_candidate` — full signaling relay sequence
- `voice:toggle_mute`, `voice:speaking`, `voice:leave`

---

## Layer 4 — E2E Browser Tests

```bash
# First time only (system deps — requires sudo):
sudo npx playwright install-deps chromium
npx playwright install chromium

# Start test DB (required — E2E needs a live database):
npm run test:db:start

# Then run (starts dev server automatically):
npm run test:e2e
npm run test:e2e:headed   # watch in browser
npm run test:e2e:ui       # interactive UI
```

**What's tested (17 tests):**
- Auth: register → dashboard, duplicate email error, wrong password error, auth guard
- Room lifecycle: create room, invite code display, join by code, seat display
- Seat selection persistence after reload
- Room API state after reconnect
- Socket.io reconnect after network interruption (via CDP offline mode)
- Full 4-player join flow

---

## Layer 5 — WebRTC Signaling E2E

Included in `npm run test:e2e` (3 tests in `voice-signaling.spec.ts`).

**What's tested:**
- Full offer → answer → ICE candidate relay via live Socket.io server
- Mute state relay between 2 browsers in same room
- `voice:user_left` cleanup when player navigates away
