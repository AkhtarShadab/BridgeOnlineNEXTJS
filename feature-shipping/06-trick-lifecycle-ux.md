# Feature 06 — Trick Lifecycle UX

> **Ship order: after 05** (playing table exists). No flag — this is a correctness fix to the core play loop. Branch off `master`.

---

## Goal

When the 4th card lands the server emits `game:trick_completed`, but the frontend ignores it — every event just calls `fetchGameState()` which returns state where the trick is already cleared. Players **never see the completed 4-card trick**, who won it, or any collection animation. Cards disappear instantly.

After this ships: all four players watch the completed trick hold on screen for ~1.5 s, the winner's seat ring flashes, and the cards animate sliding toward the winner before the table resets and trick counts increment.

## Branch

```bash
git checkout master && git pull
git checkout -b feat/trick-lifecycle
```

---

## Current state (verified in code)

**`app/game/[gameId]/page.tsx`**
- Listens for `game:card_played` and `game:trick_completed` — but both handlers just call `fetchGameState()`.
- `game:trick_completed` carries `{ gameId, winningSeat, trickCards }` from the server (see `play/route.ts` line ~232) but the payload is never read.
- There is no local state to hold a completed trick across the refetch.

**`app/api/games/[gameId]/play/route.ts`**
- Already emits `game:trick_completed` with the right payload when `currentTrick.length === 4` and a winner is resolved (line ~232).
- Payload shape: `{ gameId: string; winningSeat: string; trickCards: { seat: string; card: string }[] }` (winningSeat is full e.g. `"NORTH"`).

**`components/game/PlayingTable.tsx`**
- Accepts `trick: PlayedCard[]` and `turn: Seat | null` as props.
- Has no `trickWinner` prop and no collection CSS keyframes.

**`components/game/playing-table.css`**
- Has `bt-anim-in-{N,E,S,W}` entry keyframes (card flies in from seat direction).
- Has no exit / collection keyframes.

---

## Files to change (exact)

| # | File | Change |
|---|---|---|
| 1 | `app/game/[gameId]/page.tsx` | Add `completedTrick` state: `{ cards: PlayedCard[]; winner: Seat } \| null`. In `game:trick_completed` handler: read payload, call `FULL_TO_SEAT` on `winningSeat`, set `completedTrick`. After 1 500 ms `setTimeout`, set `completedTrick(null)` then `fetchGameState()`. **Do NOT call `fetchGameState()` immediately on trick complete** — let the delay play out. |
| 2 | `app/game/[gameId]/page.tsx` | Pass `completedTrick` state into `<PlayingTable>`: when non-null, override `trick` prop with `completedTrick.cards` and set new `trickWinner` prop. |
| 3 | `components/game/PlayingTable.tsx` | Add optional `trickWinner?: Seat` prop. When set, apply CSS class `bt-winner` to the matching `bt-seat-pos-{slot}` element (winner seat ring flashes). Apply class `bt-card-collect` to each trick card, with a CSS variable `--bt-collect-to` set to the winner's slot direction. |
| 4 | `components/game/playing-table.css` | Add `bt-winner` keyframe: amber border pulse for ~800 ms on the seat plate. Add `bt-card-collect` keyframe per direction: `@keyframes bt-collect-{bottom,top,left,right}` — card translates toward the winner's hand position over 600 ms then `opacity: 0`. |
| 5 | `app/game/[gameId]/page.tsx` | Keep existing `game:card_played` listener as-is (still calls `fetchGameState` for non-completing cards). Only change trick-complete behaviour. |

### Timing diagram

```
4th card played
  → server emits game:trick_completed { winningSeat, trickCards }
  → client sets completedTrick state (PlayingTable shows all 4 cards)
  → bt-winner pulse on winner seat (~800 ms)
  → bt-card-collect slides cards toward winner (~600 ms)
  → setTimeout 1 500 ms fires
  → completedTrick = null, fetchGameState()
  → server state replaces display (trick cleared, counts updated)
```

### Why not optimistic trick count during the hold
Trick winner computation requires suit-follow + trump logic. Cheaper to hold the visual
for a flat 1.5 s and let the re-fetch bring the authoritative `tricksWon` update.

---

## Tests (exact)

### 1. Unit — PlayingTable renders trickWinner prop

```ts
// __tests__/unit/PlayingTable.test.tsx (new)
import { render, screen } from '@testing-library/react';
import PlayingTable from '@/components/game/PlayingTable';

it('applies bt-winner class to winning seat when trickWinner prop is set', () => {
  render(<PlayingTable ... trickWinner="N" trick={[...4 cards...]} />);
  expect(document.querySelector('.bt-seat-pos-top')).toHaveClass('bt-winner');
});
```

### 2. Integration — trick hold delay in page

```ts
// __tests__/unit/trick-hold.test.ts (new)
// Mock fetchGameState and socket. Fire game:trick_completed event.
// Assert: fetchGameState NOT called immediately (within 100 ms).
// Advance timers by 1500 ms (vi.useFakeTimers). Assert: fetchGameState called once.
```

### 3. Socket payload shape

Extend `__tests__/socket/game.test.ts`:
- Assert `game:trick_completed` carries `winningSeat` (full string), `trickCards` (4-element array), `gameId`.

### 4. Manual / E2E

Add `data-testid="trick-winner-{N|E|S|W}"` to the seat element when `trickWinner` is set. E2E: after a 4th card click, assert `trick-winner-*` appears within 200 ms, then disappears after 2 s.

### Run before PR

```bash
npm run lint && npm run build
npm run test     # unit suites
npm run test:socket
npm run test:e2e -- full-game
```

---

## Definition of done

- [ ] `game:trick_completed` payload is read — `winningSeat` and `trickCards` extracted.
- [ ] `completedTrick` state holds the 4 cards and winner for exactly 1 500 ms before the re-fetch.
- [ ] `PlayingTable` accepts `trickWinner?: Seat`; winning seat shows amber pulse.
- [ ] Collection CSS keyframes animate cards toward winner's direction.
- [ ] `fetchGameState()` is **not** called immediately on trick complete (delay enforced in unit test).
- [ ] Existing `game:card_played` (non-completing) path unchanged.
- [ ] Unit + socket tests green; manual 4-browser verify shows all players see the same collect animation.
