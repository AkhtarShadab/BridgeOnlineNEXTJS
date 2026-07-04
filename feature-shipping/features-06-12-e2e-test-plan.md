# Feature: E2E Test Coverage for Features 06–12

**Branch:** `test/e2e-features-06-12`
**Type:** Test-only feature (no production code changes)
**Status:** 📋 Planned
**Owner:** Shadab

Adds Playwright UI tests for the game-flow surface that is currently unverified end-to-end. Each gap in the coverage table below maps to an already-shipped feature in `BaseFeatureManager.md`.

---

## 1. Coverage gap → feature → file mapping

| Gap (from review) | Feature | Component(s) under test | New spec file |
|---|---|---|---|
| Seats auto-assigned; all-ready → game starts | room start flow | `app/room/[roomId]`, `/api/rooms/:id/{ready,start}` | `room-start.spec.ts` |
| Bidding: make bids, 3 passes → auction ends | bidding | `BiddingBox.tsx`, `/api/games/:id/bid` | `bidding.spec.ts` |
| Playing: card plays, trick resolution | 07 play-sync | `PlayingTable.tsx`, `/api/games/:id/play` | `playing.spec.ts` |
| Trick lifecycle: winner pulse, 1.5s hold | 06 trick-lifecycle | `PlayingTable.tsx` (`trickWinner`, `trickCollecting`) | `trick-lifecycle.spec.ts` |
| ScoreCard: contract line, board scores | 10 score-depth | `ScoreCard.tsx` | `scorecard.spec.ts` |
| Multi-board: auto-advance to next board | 10 score-depth | game page `game:next_board` | `scorecard.spec.ts` (2nd describe) |
| Mobile: two-tap, BidDrawer | 09 mobile-touch | `BidDrawer.tsx`, `PlayingTable` two-tap | `mobile.spec.ts` |
| Hint button visible on turn, hidden otherwise | 12 hint-button | `HintButton.tsx` | `hint-button.spec.ts` |
| AuctionDrawer collapsed during play, expands | 11 auction-review | `AuctionDrawer.tsx` | `auction-drawer.spec.ts` |

Reconnection (08) already has `__tests__/e2e/reconnect.spec.ts`, so it is out of scope here.

---

## 2. Core strategy: API as fixture, DOM as assertion

Bridge is hostile to naive UI automation: a full board is a 4-player legal auction plus 13 tricks of legal card play, and **hands are dealt randomly** (`gameState.hands`), so you cannot hardcode "click the ♠A". Driving all of that by clicking would be slow and flaky.

The plan uses a **two-seam approach** — the same pattern the existing specs already lean on ("All select seats via API … faster than clicking UI"):

1. **Drive state through the HTTP API** (with each player's auth cookies) to deterministically reach the exact phase the test cares about — auction complete, mid-play, board complete. The API is the single source of truth and enforces legality, so this is both fast and correct.
2. **Assert and interact through the DOM** only for the behavior actually under test (a bid button click, a two-tap, a drawer toggle, the winner pulse).

This keeps each spec focused: the API gets you to the doorstep, the UI test checks the one thing in the room. It also means a dealing-RNG change can't break a UI assertion, because moves are always computed from the live hand, never assumed.

> Determinism note: because deals are random, helpers must **read `hand` / `currentTrick` from `GET /api/games/:id` and choose a legal move**, never assume a card. For the auction, the driver makes a minimal opening bid then three passes so every board reaches a real contract (an all-pass board is "passed out" and skips play entirely).

---

## 3. New shared helper: `__tests__/e2e/helpers/game.ts`

This is the heart of the work. It builds on the existing `helpers/auth.ts`. Everything else is thin.

### 3.1 Per-player API client

Playwright's `request` fixture needs the player's session cookie. Reuse each player's `BrowserContext` so cookies ride along:

```ts
// __tests__/e2e/helpers/game.ts
import { type Browser, type BrowserContext, type Page, type APIRequestContext, expect } from '@playwright/test';
import { uniqueUser, registerAndLogin } from './auth';

export type Seat = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST';
export const SEATS: Seat[] = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

export interface Player {
  ctx: BrowserContext;
  page: Page;
  api: APIRequestContext;        // ctx.request — carries the auth cookie
  user: ReturnType<typeof uniqueUser>;
  seat?: Seat;
  userId?: string;
}

/** Register+login 4 isolated players, each in their own context. */
export async function createPlayers(browser: Browser): Promise<Player[]> {
  const players: Player[] = [];
  for (let i = 0; i < 4; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const user = uniqueUser();
    await registerAndLogin(page, user);
    players.push({ ctx, page, api: ctx.request, user });
  }
  return players;
}
```

### 3.2 Room → seats → ready → start

Wraps the create/join flow the current specs duplicate, then drives ready+start via API. Returns the `gameId`.

```ts
export async function startGame(players: Player[]): Promise<{ roomId: string; gameId: string }> {
  const [host, ...rest] = players;

  // Host creates room (UI — exercises the create form once)
  await host.page.goto('/create-room');
  await host.page.fill('input[placeholder*="Friday Night"]', 'E2E Game');
  await host.page.click('button[type="submit"]');
  await host.page.waitForURL(/\/room\//, { timeout: 15_000 });
  const roomId = host.page.url().split('/room/')[1];

  const inviteCode = await host.page.locator('button.font-mono').first().innerText();

  // Others join (UI)
  for (const p of rest) {
    await p.page.goto('/join-room');
    await p.page.fill('input[placeholder="ABCD1234"]', inviteCode);
    await p.page.click('button[type="submit"]');
    await p.page.waitForURL(/\/room\//, { timeout: 15_000 });
  }

  // Seat assignment + ready via API (deterministic, no click races).
  // NOTE: confirm exact ready/seat payloads from app/api/rooms/[roomId]/ready/route.ts
  //       and the seat-select route; adjust body shape below to match.
  for (let i = 0; i < players.length; i++) {
    players[i].seat = SEATS[i];
    // await players[i].api.post(`/api/rooms/${roomId}/seat`, { data: { seat: SEATS[i] } });
    await players[i].api.post(`/api/rooms/${roomId}/ready`, { data: { ready: true } });
  }

  // Host starts the game
  const startRes = await host.api.post(`/api/rooms/${roomId}/start`, { data: {} });
  expect(startRes.ok()).toBeTruthy();
  const { gameId } = await startRes.json();   // confirm response shape

  // Land every player on the game page so socket rooms are joined
  await Promise.all(players.map(p => p.page.goto(`/game/${gameId}`)));
  return { roomId, gameId };
}
```

### 3.3 Game-state read + legal-move helpers

```ts
export interface GameState {
  phase: 'BIDDING' | 'PLAYING' | 'COMPLETED';
  boardNumber: number;
  currentPlayer: { id: string } | null;
  playerSeat: Seat;
  hand: string[];                 // engine card strings, e.g. "AS","TH"
  currentTrick: { seat: Seat; card: string }[];
  contract: { level: number; suit: string } | null;
  declarerSeat: Seat | null;
  tricksWon: { NS: number; EW: number };
}

export async function getState(p: Player, gameId: string): Promise<GameState> {
  const res = await p.api.get(`/api/games/${gameId}`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/** The player whose turn it is right now. */
export async function whoseTurn(players: Player[], gameId: string): Promise<Player> {
  const s = await getState(players[0], gameId);
  const turnId = s.currentPlayer?.id;
  const p = players.find(pl => pl.userId === turnId)
         ?? players.find(async pl => (await getState(pl, gameId)).currentPlayer?.id === pl.userId);
  return p!;   // see note: capture userId during startGame for a clean lookup
}
```

> Capture `userId` in `startGame` (read it from `GET /api/games/:id` `players[]` by matching seat) so `whoseTurn` is a simple `find`, not a scan.

### 3.4 Auction driver — reach a real contract

```ts
/** Opener bids 1♣, next three pass → contract 1C by opener's seat. Leaves phase=PLAYING. */
export async function driveAuctionToContract(players: Player[], gameId: string) {
  const opener = await whoseTurn(players, gameId);
  let res = await opener.api.post(`/api/games/${gameId}/bid`, {
    data: { action: 'bid', bid: { level: 1, suit: 'C' } },
  });
  expect(res.ok()).toBeTruthy();

  for (let i = 0; i < 3; i++) {
    const p = await whoseTurn(players, gameId);
    res = await p.api.post(`/api/games/${gameId}/bid`, { data: { action: 'pass' } });
    expect(res.ok()).toBeTruthy();
  }
  await expect.poll(async () => (await getState(players[0], gameId)).phase).toBe('PLAYING');
}
```

### 3.5 Play driver — legal card each turn

```ts
/** Pick a legal card from the live hand: follow the led suit if able, else anything. */
function pickLegal(hand: string[], trick: { card: string }[]): string {
  if (trick.length === 0) return hand[0];
  const ledSuit = trick[0].card.slice(-1);          // card = rank+suit, suit is last char
  const followers = hand.filter(c => c.endsWith(ledSuit));
  return (followers.length ? followers : hand)[0];
}

/** Play `count` cards (default = whole board: 52) via API, computing legality each time. */
export async function playCards(players: Player[], gameId: string, count = 52) {
  for (let i = 0; i < count; i++) {
    const s0 = await getState(players[0], gameId);
    if (s0.phase === 'COMPLETED') break;
    const p = await whoseTurn(players, gameId);
    const s = await getState(p, gameId);
    const card = pickLegal(s.hand, s.currentTrick);
    const res = await p.api.post(`/api/games/${gameId}/play`, { data: { card } });
    expect(res.ok()).toBeTruthy();
  }
}
```

With these six helpers every spec is a handful of lines.

---

## 4. Spec-by-spec plan

All selectors below are **real `data-testid`s already in the components** — verified against source. No production changes required to make these tests work, with one exception flagged in §4.7.

### 4.1 `room-start.spec.ts` — seats + start
- `createPlayers` → `startGame`.
- Assert each player's room page shows their assigned seat (N/E/S/W) before start.
- After `startGame`, assert all four pages reach `/game/:id` and `getState().phase === 'BIDDING'`.
- Negative: starting with <4 ready players returns non-OK from `/start` (drive via API, assert `res.status()` is 4xx).

### 4.2 `bidding.spec.ts` — auction via real UI
This one **clicks the BiddingBox** rather than the API, since the bidding *UI* is the thing under test.
- Reach BIDDING via `startGame`.
- For the player on turn, open the game page and click a bid grid button by its `title` attribute: `page.getByTitle('Bid 1♣')` (the button's `title` is `Bid {level}{symbol}`). Then `page.getByRole('button', { name: 'Pass' })` for the other three (drive the passers by API for speed, or click if you want full-UI).
- Assert auction end: `getState().phase` flips to `PLAYING` and the felt contract chip `[data-testid="felt-contract"]` renders.
- Validity test: a too-low bid button is disabled — assert `getByTitle(/≤ current bid/)` has `disabled`.
- Double/redouble: after an opponent bid, assert the `Dbl ×` button is enabled for the opponent and disabled for partner (drive a 2-bid sequence, check `getByRole('button',{name:'Dbl ×'})` enabled state).

### 4.3 `playing.spec.ts` — card play + trick resolution (Feature 07)
- `startGame` → `driveAuctionToContract`.
- The on-lead player's page should show their hand as `[data-testid="hand-card-*"]`. Count = 13 for the viewer.
- Play one trick **through the UI** to test optimistic update + two-tap confirm (see §4.6 for the tap mechanics — note two-tap is used on desktop too): tap a card to select (`[data-selected="true"]`), tap again to confirm; assert the card lands on the felt and disappears from hand.
- Then fast-forward the rest of the trick by API and assert `tricksWon` increments for the winning side.
- Error path: attempt an illegal play via API (off-suit when able) and assert the page surfaces an error toast (`addToast('Illegal play')`).

### 4.4 `trick-lifecycle.spec.ts` — winner pulse + 1.5s hold (Feature 06)
The tricky timing one. The page holds 4 cards on the felt and pulses the winner ring for ~1.5s (`trickWinner` / `trickCollecting`).
- Reach PLAYING, then play exactly 4 cards (one full trick) via API while the winning player's page is open.
- Assert the winner's seat gets the pulse: `[data-testid="trick-winner-{N|E|S|W}"]` gains class `bt-winner`. Use `expect(locator).toHaveClass(/bt-winner/)`.
- Assert the hold: all four `.bt-card` remain on the felt immediately after the 4th card, then clear. Use `expect.poll` with a timeout window rather than a hard `waitForTimeout`, to avoid CI flake — assert "still 4 cards" within 1s, "0 cards" after ~2s.
- Disable retries' video reliance: this spec benefits from `trace: 'on'` locally while authoring.

### 4.5 `scorecard.spec.ts` — result screen + multi-board (Feature 10)
Two describes:
- **Single board:** `startGame` → auction → `playCards(52)` → `expect.poll(phase).toBe('COMPLETED')`. Assert `[data-testid="score-card"]` visible; `[data-testid="score-contract-line"]` shows the contract (`1♣`) and a made/down result; `[data-testid="board-scores-table"]` has one row.
- **Multi-board:** create the room with >1 board (confirm how board count is set — room settings). After board 1 completes, assert `[data-testid="next-board-countdown"]` appears, then `expect.poll(boardNumber).toBe(2)` and `phase` returns to `BIDDING`. After the final board, assert `[data-testid="back-to-dashboard"]` shows instead of the countdown.

### 4.6 `mobile.spec.ts` — two-tap + BidDrawer (Feature 09)
Add a mobile project to `playwright.config.ts` (see §5) or set viewport inline: `test.use({ viewport: { width: 390, height: 844 } })` — must be `< 640` to flip `isMobile`.
- **BidDrawer:** in BIDDING on mobile, the inline BiddingBox is replaced by a FAB `[data-testid="bid-fab"]`. Click it → `[data-testid="bid-drawer"]` (role=dialog) slides up. Click a bid inside → drawer closes (`bidDrawerOpen=false`) and the bid registers. Also test `[data-testid="bid-drawer-close"]` and ESC-to-close.
- **Two-tap:** in PLAYING, first tap on `[data-testid="hand-card-XX"]` sets `[data-selected="true"]` and lifts the card; second tap on the same card confirms the play; a tap on a *different* card switches selection; a tap outside `.bt-hand` clears it.

### 4.7 `hint-button.spec.ts` — visibility/enabled on turn (Feature 12)
- Reach BIDDING. On the **current player's** page, `[data-testid="hint-button"]` is enabled; on a **non-turn** player's page it is `disabled` (the component takes `disabled={!isMyTurn}`).
- ⚠️ **Flag dependency:** HintButton is Feature 12 behind `FEATURE_AI_HINTS`, and it calls `POST /api/games/:id/hint` (Feature 02, "📋 Planned"). Two sub-cases:
  - **Flag off (default):** confirm whether the button renders at all. If the page gates it on the flag, the visibility test must run with `NEXT_PUBLIC_FEATURE_AI_HINTS=true` (add to a dedicated Playwright project or `.env.test`). **Verify the actual gate in `app/game/[gameId]/page.tsx` before finalizing.**
  - **Hint result/error:** since the AI backend is planned-only, assert the *error* path — click hint, expect `[data-testid="hint-error"]` to appear and auto-clear after 5s. Don't assert a real suggestion until Feature 02 lands.

### 4.8 `auction-drawer.spec.ts` — collapsed during play, expands (Feature 11)
- Reach PLAYING (`driveAuctionToContract`). Assert `[data-testid="auction-drawer"]` renders with the collapsed contract chip, and the expanded `[data-testid="bid-table"]` is **not** present.
- Click `[data-testid="auction-drawer-toggle"]` → `[data-testid="bid-table"]` appears with the auction rows (the 1♣ + three Pass we drove). Click again → collapses.

---

## 5. Config & infra changes

`playwright.config.ts` — add a mobile project so mobile specs run in a phone viewport without per-test `test.use`:

```ts
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'mobile-chrome', use: { ...devices['Pixel 7'] },
    testMatch: /mobile\.spec\.ts/ },
],
```

Keep `fullyParallel: false` / `workers: 1` (already set) — the 4-context games are heavy and the shared test DB is reset between runs, so serial is safest. If you later parallelize, give each worker its own DB schema.

`.env.test` — if the hint visibility test needs the flag on, add:
```
NEXT_PUBLIC_FEATURE_AI_HINTS=true
FEATURE_AI_HINTS=true
```
(or scope it to a dedicated `hint` project via the `webServer.env` block).

`package.json` — optional convenience scripts:
```
"test:e2e:game": "playwright test bidding playing trick-lifecycle scorecard auction-drawer",
"test:e2e:mobile": "playwright test --project=mobile-chrome"
```

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Random deals make a chosen card illegal | `pickLegal` computes from live `hand` + `currentTrick` every turn; never hardcode |
| `waitForTimeout` flake on the 1.5s pulse | Use `expect.poll` / `toHaveClass` with bounded timeouts, not fixed sleeps |
| Socket event lag vs API truth | Assert against `GET /api/games/:id` (source of truth); use UI assertions only for the rendered behavior, with generous `expect` timeouts |
| Seat/ready/start payload shapes unverified | Three routes (`/seat` if present, `/ready`, `/start`) — read the route files and confirm request/response bodies before writing the helper (marked inline) |
| Hint button flag gating unknown | Verify the gate in the game page; default to testing the error path until Feature 02 ships |
| 4 contexts × full board is slow | API-drive everything except the one behavior per spec; budget ~60s/test (config `timeout: 60_000` already) |

---

## 7. Build order (suggested tasks)

1. Verify request/response shapes: `GET /api/games/:id`, `/bid`, `/play`, `/rooms/:id/{seat,ready,start}`. Adjust helper payloads.
2. Write `helpers/game.ts` (§3) and a smoke test that just `startGame` + asserts `phase==='BIDDING'`.
3. `room-start.spec.ts`, then `bidding.spec.ts` (validates auction driver).
4. `playing.spec.ts` + `trick-lifecycle.spec.ts` (validates play driver + timing).
5. `scorecard.spec.ts` (single + multi-board).
6. `auction-drawer.spec.ts`, `mobile.spec.ts`, `hint-button.spec.ts`.
7. Config: mobile project + scripts. Run `npm run test:e2e` green.
8. Wire into CI (`.github/`) once stable.

---

## 8. Acceptance

- All nine spec files pass locally via `npm run test:e2e` against the dockerized test DB.
- No production source changed except (if required) an added `data-testid` — none currently anticipated.
- `BaseFeatureManager.md` updated: add a "Tests" column note for 06–12.
