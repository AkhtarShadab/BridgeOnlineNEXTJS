# Feature 11 — Auction Review During Play

> **Ship order: after 05**. No flag — this is a pure UX improvement. Branch off `master`.

---

## Goal

Once the auction ends and the PLAYING phase begins, the full 4-column auction table is still rendered above the 3D table — eating ~200 px of vertical space. Defenders need to re-check the auction frequently; declarers less so. There is also no compact contract indicator on the table felt itself.

After this ships: during PLAYING the auction collapses into a single-line contract chip (`4♠ · S · NS vul`). Clicking it expands a collapsible drawer showing the full bid table. A matching contract chip is also rendered on the felt center for quick reference without leaving the table view.

## Branch

```bash
git checkout master && git pull     # Feature 05 merged
git checkout -b feat/auction-review
```

---

## Current state (verified in code)

**`app/game/[gameId]/page.tsx`**
```tsx
{/* Bidding History — 4-column ACBL-style table */}
<div className="bg-surface border border-border rounded-2xl shadow-xl p-6">
  <h2>Auction</h2>
  {/* full table renders regardless of game.phase */}
```
- `game.phase === 'PLAYING'` or `'COMPLETED'` renders the same full table.
- The auction table and Players panel sit in a `grid-cols-1 lg:grid-cols-2` layout that takes up half the page width on desktop.

**`components/game/PlayingTable.tsx`**
- Has a `tricksWon` scoreboard chip on the felt.
- No contract chip prop.

---

## Files to change (exact)

| # | File | Change |
|---|---|---|
| 1 | `app/game/[gameId]/page.tsx` | During BIDDING: keep existing full auction table (no change). During PLAYING / COMPLETED: replace with `<AuctionDrawer>`. |
| 2 | `components/game/AuctionDrawer.tsx` | **New.** Collapsed state: single-line chip `{level}{suit} by {declarerName} · {vulLabel}`. Expanded state: full bid table (copy markup from page.tsx). Toggle on chip click. Default collapsed. Animate open/close with CSS `max-height` transition. |
| 3 | `components/game/PlayingTable.tsx` | Add optional `contract?: { level: number; suit: string; by: string; doubled?: boolean; redoubled?: boolean }` prop. When set, render a compact contract chip inside `.bt-felt` (bottom-center, below the trick area): `4♠ · S`. Use existing `GLYPH` map for suit symbol. |
| 4 | `app/game/[gameId]/page.tsx` | Pass `contract` prop to `<PlayingTable>` during PLAYING phase. |

### `AuctionDrawer` component spec

**Collapsed (default):**
```
[4♠ by South · NS vul  ▼]
```
- Full-width pill, `bg-surface border border-border rounded-xl px-4 py-2`.
- Suit symbol colored by `getSuitColor`.
- Vulnerability label: `NS vul` / `EW vul` / `both vul` / `neither vul`.
- Chevron rotates 180° when expanded.

**Expanded:**
```
[4♠ by South · NS vul  ▲]
────────────────────────────
 W        N        E     S(D)
          1NT
 Pass    2♣      Pass    4♠
 Pass   Pass     Pass
```
- Same bid table markup already in page.tsx — extract into a shared `<BidTable>` component or inline in `AuctionDrawer`.
- Expandable panel uses `overflow-hidden transition-[max-height]` for a smooth reveal.

**Contract on felt:**
- Positioned `bottom: 120px; left: 50%; transform: translateX(-50%)` inside `.bt-felt`.
- Small pill: dark surface, white text, suit symbol in suit color.
- Only renders after contract is set (i.e. `game.contract !== null`).

---

## Tests (exact)

### 1. Unit — AuctionDrawer toggle

```ts
// __tests__/unit/AuctionDrawer.test.tsx (new)
// Render with a contract and bidRows. Assert collapsed by default (full table not visible).
// Click chip. Assert expanded (bid table visible).
// Click again. Assert collapsed.
```

### 2. Unit — contract chip prop in PlayingTable

```ts
// Render <PlayingTable contract={{ level: 4, suit: 'S', by: 'South' }} .../>
// Assert chip text "4♠" and "S" present in output.
// Render without contract prop. Assert chip absent.
```

### 3. E2E

```ts
// full-game.spec.ts: after auction ends, assert data-testid="auction-drawer" present.
// Assert full bid table NOT visible initially.
// Click drawer chip. Assert bid table appears (data-testid="bid-table").
// Assert contract chip visible on the felt (data-testid="felt-contract").
```

### Run before PR

```bash
npm run lint && npm run build
npm run test
npm run test:e2e -- full-game
```

---

## Definition of done

- [ ] During BIDDING: full auction table visible as before (no regression).
- [ ] During PLAYING / COMPLETED: `<AuctionDrawer>` replaces the full table; defaults to collapsed.
- [ ] Collapsed chip shows `level + suit symbol + declarer + vulnerability`.
- [ ] Expanded chip shows full 4-column bid table — all bids correct, dealer column first.
- [ ] Contract chip rendered on PlayingTable felt when `contract` prop provided.
- [ ] Chip click toggles with smooth CSS animation.
- [ ] `data-testid="auction-drawer"` and `data-testid="felt-contract"` present for E2E.
- [ ] Unit + E2E tests green.
