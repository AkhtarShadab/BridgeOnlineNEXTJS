# Feature 10 — Score Depth & Result Screen

> **Ship order: after 05b** (multi-board / next-game flow exists). No flag. Branch off `master`.

---

## Goal

The COMPLETED screen currently shows only raw `scoreNS` / `scoreEW` totals and uses `window.location.href` (full page reload) to navigate to the next board. Missing: the contract result line ("4♠ by South, made +1, +650"), tricks taken vs. needed, vulnerability shown on the table during play, cumulative per-board scores across the session, and a proper `router.push` transition.

After this ships: players see a rich score card after each board — contract, result, points breakdown — plus a running score table for all boards in the session. Vulnerability is marked on the felt during play.

## Branch

```bash
git checkout master && git pull     # Feature 05b (multi-board) merged
git checkout -b feat/score-depth
```

---

## Current state (verified in code)

**`app/game/[gameId]/page.tsx` — COMPLETED section**
```tsx
<div className="text-3xl font-bold text-foreground">{(game as any).scoreNS ?? 0}</div>
// ...
if (data.nextGameId) {
  setTimeout(() => {
    window.location.href = `/game/${data.nextGameId}`;  // full reload
  }, 3000);
}
```

**`app/api/games/[gameId]/route.ts` — GET response**
- Returns `scoreNS`, `scoreEW` (integers, can be undefined).
- Does **not** return: `tricksNeeded`, `tricksTaken`, `contractMade`, `overtricks`, `undertricks`, `doubled`, `redoubled`, `boardScores[]`.

**`lib/game/scoring.ts`**
- `calculateScore(contract, tricksTaken, vulnerability, doubled, redoubled)` returns `{ nsScore, ewScore }`.
- Internally computes `tricksNeeded = contract.level + 6`, `overtricks`, `undertricks` — but **does not return them**.

**`lib/utils/vulnerability.ts`**
- `getVulnerability(boardNumber)` returns `{ NS: boolean, EW: boolean }` — already available.

**`components/game/PlayingTable.tsx`**
- No vulnerability indicator on the felt.

---

## Files to change (exact)

| # | File | Change |
|---|---|---|
| 1 | `lib/game/scoring.ts` | Extend return type to include `{ nsScore, ewScore, tricksNeeded, tricksTaken, overtricks, undertricks, contractMade, doubled, redoubled }`. Export new type `ScoreBreakdown`. |
| 2 | `app/api/games/[gameId]/route.ts` | Add `result: ScoreBreakdown \| null` to the GET response (populated from `GameResult` record if it exists). Add `boardScores: BoardScore[]` — query all `GameResult` records linked to the same `GameRoom`, ordered by `boardNumber`, return `{ boardNumber, scoreNS, scoreEW, contract, result }` array. |
| 3 | `app/game/[gameId]/page.tsx` | Fix `window.location.href` → `router.push(\`/game/${data.nextGameId}\`)`. |
| 4 | `app/game/[gameId]/page.tsx` | Replace the raw score divs with `<ScoreCard result={game.result} boardNumber={game.boardNumber} totalBoards={game.totalBoards} boardScores={game.boardScores} vulnerability={game.vulnerability} contract={game.contract} declarer={game.declarer} />`. |
| 5 | `components/game/ScoreCard.tsx` | **New.** Contract result line, score breakdown table, cumulative board scores table, "Next board starting…" countdown or "Back to Dashboard" button. |
| 6 | `components/game/PlayingTable.tsx` | Add `vulnerability?: { NS: boolean; EW: boolean }` prop. Render corner indicators on the felt: NS sides flash red when `vulnerability.NS`, EW sides when `vulnerability.EW`. Use `--suit-red` token. |
| 7 | `app/game/[gameId]/page.tsx` | Pass `vulnerability={game.vulnerability}` to `<PlayingTable>` during PLAYING phase. |

### `ScoreCard` design

**Contract result line:**
```
4♠  by South    made +1    +650    (NS vul)
```
Undertrick example:
```
3NT  by West     down 2     −200    (neither vul)
```

**Breakdown table** (collapsed by default, expandable):
| | NS | EW |
|---|---|---|
| Tricks needed | 10 | — |
| Tricks taken | 11 | — |
| Overtricks | 1 | — |
| Score | **+650** | **0** |

**Cumulative board scores table:**
| Board | Contract | Result | NS | EW | NS Total | EW Total |
|---|---|---|---|---|---|---|
| 1 | 4♠ S | +1 | 650 | 0 | 650 | 0 |
| 2 | 3NT W | -2 | 200 | 0 | 850 | 0 |

**Vulnerability indicators on felt:**
- Small red corner triangles or text `VUL` in the NS seat positions when NS vulnerable.
- Same for EW.
- Neither vulnerable: no indicator. Both vulnerable: both sides show.

### `BoardScore` type

```ts
type BoardScore = {
  boardNumber: number;
  scoreNS: number;
  scoreEW: number;
  contract: { level: number; suit: string; doubled?: boolean; redoubled?: boolean } | null;
  result: { contractMade: boolean; overtricks: number; undertricks: number } | null;
};
```

---

## Tests (exact)

### 1. Unit — scoring.ts extended return

```ts
// __tests__/unit/scoring.test.ts — extend existing
// Assert ScoreBreakdown fields for: made contract, overtricks, undertricks, doubled undertricks.
// Regression: nsScore / ewScore values unchanged from current tests.
```

### 2. Unit — ScoreCard rendering

```ts
// __tests__/unit/ScoreCard.test.tsx (new)
// Render with a made contract: assert "made +1" and "+650" in output.
// Render with undertricks: assert "down 2" and "−200".
// Render boardScores array: assert all rows render with correct running totals.
```

### 3. API — GET returns result + boardScores

```ts
// __tests__/db/game-result.test.ts (new, requires test:db:start)
// Seed a completed game with a GameResult. Call GET /api/games/:id.
// Assert response has result.contractMade, result.tricksNeeded, result.tricksTaken.
// Seed 3 completed games in same room. Assert boardScores has 3 entries, ordered by boardNumber.
```

### 4. E2E

```ts
// full-game.spec.ts: after last trick, assert data-testid="score-card" is visible.
// Assert "made" or "down" text appears. Assert boardScores table has at least 1 row.
// Assert no full-page reload occurs on next-board navigation (check console for unload event).
```

### Run before PR

```bash
npm run lint && npm run build
npm run test && npm run test:db
npm run test:e2e -- full-game
```

---

## Definition of done

- [ ] `scoring.ts` returns full `ScoreBreakdown` including `tricksNeeded`, `tricksTaken`, `contractMade`, `overtricks`, `undertricks`.
- [ ] GET `/api/games/:id` includes `result: ScoreBreakdown | null` and `boardScores: BoardScore[]`.
- [ ] `<ScoreCard>` shows contract result line and score; expandable breakdown table; cumulative board scores.
- [ ] `window.location.href` replaced with `router.push` — no full reload on next-board navigation.
- [ ] Vulnerability corner indicators on `<PlayingTable>` felt.
- [ ] Unit (scoring + ScoreCard) + DB tests green.
- [ ] E2E asserts ScoreCard present and no page reload.
