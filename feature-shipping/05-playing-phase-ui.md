# Feature 05 — Playing Phase UI (Card Table + Play Flow)

> **Ship order: after 00**, independent of the AI features (02–04). Builds the missing PLAYING-phase frontend the design doc calls **GameTable** (§Components). Gate rollout behind `FEATURE_PLAY_PHASE` / `NEXT_PUBLIC_FEATURE_PLAY_PHASE` (added in Feature 00's flag registry).

---

## Goal

The auction works end to end and the server flips the game to `PLAYING`, but **there is no UI to play the hand**. The `/api/games/[gameId]/play` route is fully implemented (validation, trick resolution, scoring, persistence) yet nothing on the client renders the table, the trick, the dummy, or makes cards clickable. This feature builds that surface **and closes two server gaps** that block real-time play.

After this ships: declarer/defenders see a felt table with N/S/E/W seats, the dummy face-up after the opening lead, the four cards of the live trick in the center, a running trick tally per team, and clickable cards that POST to `/play` — all updating in real time across the four browsers.

## Branch

```bash
git checkout master && git pull     # Feature 00 merged (flag registry exists)
git checkout -b feat/play-phase-ui
```

---

## Current state (verified in code)

**Frontend — `app/game/[gameId]/page.tsx`**
- Renders `game.hand` only (the static `renderCard` grid, lines ~531–543).
- `game.dummyHand`, `game.currentTrick`, `game.tricks`, `game.tricksWon`, `game.contract.suit` (trump) are returned by the API but **never referenced**.
- `renderCard` has `cursor-pointer hover:border-accent` styling but **no `onClick`** — cards look clickable, do nothing.
- `BiddingBox` is gated on `game.phase === 'BIDDING'`; when phase becomes `PLAYING` the box correctly disappears but **nothing replaces it**.
- The turn banner is hard-coded to bidding language ("Your turn to bid!", "Waiting for X to bid…").
- Socket listeners exist for `game:bid_made` and `game:player_exited` only.

**Play API — `app/api/games/[gameId]/play/route.ts`** (works, with two gaps)
- ✅ Validates turn (incl. declarer-plays-for-dummy via `isDeclarerPlayingForDummy`), follow-suit (`isValidPlay`), resolves trick winner (`determineTrickWinner`), advances `currentPlayerId`, persists `gameState.{hands,currentTrick,tricks}`, runs `calculateScore` and writes `GameResult` on the 13th trick, flips to `COMPLETED`.
- ❌ **Emits no socket event.** The bid route broadcasts `game:bid_made` to `room-${id}` + `game-${id}` (lines ~221–238). The play route has no `global.io` block, so other players never learn a card was played until they manually refetch. **Real-time play is broken at the server.**
- Request contract: `POST` body `{ card: "AS" }` — regex `^[2-9TJQKA][CDHS]$` (rank then suit; note **`T` for ten**, not `10`).
- Response: `{ success, card, trickComplete, gameComplete, score? }`.

**GET state — `app/api/games/[gameId]/route.ts`** (dummy-reveal bug)
- Returns `dummyHand` **only while `gameState.currentTrick.length > 0`** (lines ~88–97). Because the play route resets `currentTrick` to `[]` the moment a trick completes, **the dummy disappears between tricks**. Correct rule: dummy is revealed once the opening lead is played and stays revealed for the rest of the deal.
- Returns per-seat `players[]` with `{ userId, username, seat, avatarUrl }`, plus `currentPlayer`, `declarer`, `dealer`, `contract`, `trumpSuit`, `tricksWon: {NS,EW}`.

**Data shapes (so the renderer parses correctly)**
- Hands & played cards are **strings** `"AS"` (`rank+suit`). The existing `parseCard` (`c[0]` rank, `c[1]` suit) already handles this.
- `currentTrick`: `Array<{ card: string; player: userId; seat: 'NORTH'|... }>`.
- `tricks`: `Array<{ cards: currentTrick[]; winner: seat }>`.
- `contract`: `{ level, suit }` where `suit ∈ {C,D,H,S,NT}`; trump for trick logic is `contract.suit` (`NT` = none).

**Socket handlers — `lib/socket/register-handlers.js`**
- A `game:card_played` relay already exists (client→server→room) but is unused by the API path. The design doc (§Socket events) specifies `game:card_played`, `game:trick_completed`, `game:dummy_revealed`. We standardize on the **API-emits-to-room** pattern already used for bids.

---

## Files to change (exact)

| # | File | Change |
|---|---|---|
| 1 | `lib/features.ts` | Add `playPhase: on(process.env.NEXT_PUBLIC_FEATURE_PLAY_PHASE ?? process.env.FEATURE_PLAY_PHASE, false)`. (Client component reads it, so the `NEXT_PUBLIC_` twin is required — same pattern as `newUI`/`voiceChat`.) |
| 2 | `app/api/games/[gameId]/route.ts` | **Fix dummy reveal.** Replace the `currentTrick.length > 0` guard with: reveal when `tricks.length > 0 \|\| currentTrick.length > 0` (i.e. opening lead has been played at any point this deal). Keep returning `null` before the opening lead. |
| 3 | `app/api/games/[gameId]/play/route.ts` | **Add socket broadcast** mirroring the bid route. After each successful play, `global.io.to(roomKey).to(gameKey).emit('game:card_played', { gameId, card, seat, nextPlayerId, trickComplete })`. On trick completion also emit `game:trick_completed` `{ winner, tricksWon }`. On the opening lead emit `game:dummy_revealed` `{ }` (payload empty — clients refetch). On `gameComplete` emit `game:scoring` `{ score }`. Guard with `if (global.io)` + the same `console.error` else-branch as bid. **No business-logic changes** — broadcast only. |
| 4 | `components/game/GameTable.tsx` | **New.** The playing surface (details below). Props: `{ game, sessionUserId, onPlayCard }`. Pure presentation + click delegation; no fetching. |
| 5 | `components/game/PlayingCard.tsx` | **New (optional refactor).** Extract the single-card renderer from `page.tsx` so hand, dummy, and trick all share one component with a `playable`/`onClick`/`faceDown` API. Reuse existing `SuitIcons` + `getSuitColor`. |
| 6 | `app/game/[gameId]/page.tsx` | Wire it up: add `handlePlayCard`; add a `game:card_played`/`game:trick_completed`/`game:dummy_revealed` socket listener (refetch on each, same pattern as `handleBidMade`); render `<GameTable>` when `phase === 'PLAYING'` (gated behind `isEnabled('playPhase')` during rollout); make the turn banner phase-aware ("Your turn to play" vs "to bid"); keep the existing hand grid only for BIDDING or fold it into GameTable. |
| 7 | `.env.example` | Document `FEATURE_PLAY_PHASE` / `NEXT_PUBLIC_FEATURE_PLAY_PHASE`. |

> **Order within the branch:** #1 → #2 → #3 (server correct & broadcasting first; verify with two browsers + a manual refetch), then #4–#6 (UI), then #7. The UI is untestable until the dummy bug and the broadcast are fixed.

---

## GameTable component — what to build (design-doc §GameTable)

1. **Seat layout — N/S/E/W around a felt center.** South is always the local player; rotate the other three relative to the local seat so "you" are at the bottom. Each seat shows username, seat label, and the existing turn-ring on the active seat. Reuse `--felt` and `.turn-ring` from Feature 01 tokens.
2. **Current trick (center).** Render `game.currentTrick` — up to 4 cards, each positioned toward the seat that played it (`.seat`). Face-up. Empty center before the lead.
3. **Dummy hand.** When `game.dummyHand` is non-null, render the declarer's partner's cards **face-up**, grouped by suit. These are **clickable only when you are the declarer and it is the dummy's turn** (server already authorizes this via `isDeclarerPlayingForDummy`).
4. **Your hand → clickable on your turn.** Cards become clickable when `isMyTurn`. On click, call `onPlayCard(cardString)`. Disable (dim, no pointer) when not your turn. Give immediate optimistic feedback but treat the server response/socket refetch as truth — illegal plays (revoke) come back as a 400 and must surface (toast/alert) without mutating local hand.
5. **Trick tally per team.** Show `game.tricksWon.NS` / `.EW` and the contract (`level + suit + "by " + declarer`), plus tricks needed (`contract.level + 6`).
6. **`handlePlayCard` (page.tsx).** Mirror `handleBid`:

```ts
const handlePlayCard = async (card: string) => {
  try {
    const res = await fetch(`/api/games/${gameId}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card }),               // card is "AS" form, NOT "10S"
    });
    if (res.ok) {
      fetchGameState();                              // socket will also fire; refetch is the safety net
    } else {
      const data = await res.json();
      alert(data.error || 'Illegal play');           // follow-suit / not-your-turn
    }
  } catch {
    alert('An error occurred');
  }
};
```

> **Ten gotcha:** the hand stores `"TS"`; the UI prints `10`. Send `"TS"` to the API (the `[2-9TJQKA]` regex rejects `"10S"`). Build the card string from `parseCard().rank`, not the displayed `10`.

---

## Tests (exact)

### 1. Unit — server logic stays green (untouched by this branch)

```bash
npm run test     # includes __tests__/unit/playing.test.ts, scoring.test.ts
```

`isValidPlay` / `determineTrickWinner` / `calculateScore` are not modified — these must keep passing.

### 2. GET dummy-reveal fix — `__tests__/db/play-state.test.ts` (new, or extend existing db suite)

Needs `npm run test:db:start` first. Seed a game in `PLAYING`, then assert:
- Before opening lead (`tricks=[]`, `currentTrick=[]`) → `dummyHand === null`.
- After opening lead (`currentTrick.length === 1`) → `dummyHand` is the declarer's partner's 13 cards.
- **Regression for the bug:** after a completed trick (`tricks.length === 1`, `currentTrick === []`) → `dummyHand` is **still non-null**.

### 3. Socket broadcast — `__tests__/socket/game.test.ts` (extend)

Assert the play route emits `game:card_played` to both `room-${id}` and `game-${id}`, and `game:trick_completed` carries `{ winner, tricksWon }` on the 4th card. (Match the style of the existing `game:bid_made` assertions.)

### 4. e2e — extend `__tests__/e2e/full-game.spec.ts`

The spec already drives 4 players to the ready state and through bidding. Add the play phase:
- After the auction ends, assert the BiddingBox is gone and `data-testid="game-table"` is present.
- The player on lead clicks a legal card; assert it appears in `data-testid="current-trick"` in **all four** browser contexts (verifies the new broadcast).
- After the opening lead, assert `data-testid="dummy-hand"` renders face-up in every context.
- Play a full trick (4 cards); assert the trick tally increments for the winning team.
- (Stretch) play all 13 tricks and assert the page reaches the SCORING/COMPLETED view.

Add stable hooks while building: `data-testid="game-table" | "current-trick" | "dummy-hand" | "trick-tally"` and `data-testid="hand-card"` on playable cards.

### Run before PR

```bash
npm run lint && npm run build
npm run test && npm run test:socket
npm run test:db        # after: npm run test:db:start
npm run test:e2e -- full-game
# manual: 4 browsers, bid to a contract, confirm trick + dummy + tally update live in all four
```

---

## Definition of done

- [x] `FEATURE_PLAY_PHASE` (+ `NEXT_PUBLIC_` twin) registered in `lib/features.ts`, documented in `.env.example`.
- [x] Dummy reveal fixed: stays visible from opening lead through the rest of the deal (db test guards the regression).
- [x] Play route broadcasts `game:card_played` / `game:trick_completed` / `game:dummy_revealed` to `room-` + `game-` channels; no business-logic change.
- [x] `GameTable` renders N/S/E/W with local seat at bottom, live current trick, face-up dummy after the lead, and per-team trick tally + contract.
- [x] Cards are clickable on your turn (and dummy cards when declarer on dummy's turn); illegal plays surface the server error without corrupting local state; `"T"` (not `"10"`) is sent.
- [x] Real-time: a card played in one browser appears in the other three without manual refresh.
- [x] Turn banner is phase-aware; BiddingBox still only shows in BIDDING.
- [x] unit/socket/db green; `full-game.spec.ts` plays at least one full trick across 4 contexts.

---

## ✅ Status: Merged (PR #22)

**Known gaps / follow-on work (tracked as separate features):**

| Gap | Feature |
|---|---|
| `game:trick_completed` payload ignored — completed trick never shown, no collect animation | [06 — Trick lifecycle UX](./06-trick-lifecycle-ux.md) |
| `onPlayCard` has no error handling; no optimistic card placement; no double-click guard | [07 — Play sync + optimistic state](./07-play-sync-optimistic.md) |
| Auction table stays fully expanded during PLAYING phase, wasting vertical space | [11 — Auction review during play](./11-auction-review.md) |
| `window.location.href` hard-reload on next-board; score screen shows only raw totals | [10 — Score depth & result screen](./10-score-depth.md) |
| No hover/raise equivalent on touch; BiddingBox overflows mobile viewport | [09 — Mobile / touch support](./09-mobile-touch.md) |
