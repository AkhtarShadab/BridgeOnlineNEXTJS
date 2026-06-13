# Feature 09 — Mobile / Touch Support

> **Ship order: after 05 + 01** (playing table and design tokens exist). No flag — these are progressive-enhancement fixes. Branch off `master`.

---

## Goal

`PlayingTable` uses `onMouseEnter`/`onMouseLeave` to raise cards on hover. On touch devices hover never fires, so the first tap immediately plays a card with no confirmation — unacceptable in a game where an accidental play ends your turn. The design doc also specifies responsive breakpoints (§Components §Responsive) that are unimplemented: vertical layout under 640 px, bid grid as a modal overlay, and a swipeable hand strip.

After this ships: mobile players get a two-tap confirmation flow for card play, a horizontal scroll-snap hand strip, and a floating "Bid" button that opens the `BiddingBox` as a bottom-sheet modal.

## Branch

```bash
git checkout master && git pull     # Features 01 + 05 merged
git checkout -b feat/mobile-touch
```

---

## Current state (verified in code)

**`components/game/PlayingTable.tsx` — `HandFan`**
```tsx
onMouseEnter={(e) => { e.currentTarget.style.transform = base + " translateY(-26px)"; }}
onMouseLeave={(e) => { e.currentTarget.style.transform = base; }}
onClick={() => clickable && onPlayCard?.(seat, card)}
```
- No touch equivalent — `onMouseEnter` does not fire on iOS/Android.
- Single tap fires `onClick` immediately on touch.

**`components/game/BiddingBox.tsx`**
- Rendered inline below the hand on all screen sizes.
- The 7×5 grid is ~560 px wide — wider than most phone viewports.

**`components/game/playing-table.css`**
- `.bt-stage` has `height: clamp(600px, 85vh, 960px)` — tall on mobile.
- No `@media (max-width: 640px)` blocks.

**`app/game/[gameId]/page.tsx`**
- Layout is `grid-cols-1 lg:grid-cols-2` — auction/players panel goes full width on mobile.
- No viewport meta or viewport-specific rendering branching.

---

## Files to change (exact)

| # | File | Change |
|---|---|---|
| 1 | `components/game/PlayingTable.tsx` | Add `selectedCard: string \| null` state to `HandFan`. On `onClick`: if no `selectedCard`, set it (raise that card); if `selectedCard === card`, call `onPlayCard` and clear selection; if `selectedCard !== card`, swap selection. Add `onTouchStart` to also set selection (prevents iOS ghost-click). Add a "Cancel" chip when `selectedCard` is set. Clear selection on tap-outside via `useEffect` window `touchstart` listener. |
| 2 | `components/game/PlayingTable.tsx` | Same two-tap logic for `DummyFan`. |
| 3 | `components/game/playing-table.css` | `@media (max-width: 640px)`: `.bt-stage { height: auto; min-height: 420px; }`. `.bt-hand` switches to `overflow-x: auto; scroll-snap-type: x mandatory; display: flex; flex-wrap: nowrap;` — each `.bt-card` gets `scroll-snap-align: center; flex-shrink: 0`. Remove `rotateZ` fan transform on mobile (flat linear row). |
| 4 | `components/game/playing-table.css` | `@media (max-width: 640px)`: hide `.bt-seat-pos-left` and `.bt-seat-pos-right` labels (too cramped), compress `.bt-scoreboard` to icon-only. |
| 5 | `app/game/[gameId]/page.tsx` | During BIDDING phase on mobile (`window.innerWidth < 640` or via CSS `sm:` breakpoint): replace inline `<BiddingBox>` with a floating "Bid ▲" button fixed at the bottom of the screen. Tapping it opens a bottom-sheet drawer containing `<BiddingBox>`. |
| 6 | `components/game/BidDrawer.tsx` | **New.** Bottom-sheet wrapper: dark overlay + slide-up panel with `<BiddingBox>` inside. Closes on backdrop tap or after a bid is submitted. Accessible: `role="dialog"`, focus trap, `Escape` key closes. |
| 7 | `app/layout.tsx` | Verify `<meta name="viewport" content="width=device-width, initial-scale=1">` is present (it should be from Next.js default, but confirm). |

### Two-tap selection spec

```
State: idle
  → tap legal card → selectedCard = card (card raises +26 px, Cancel chip shows)

State: selected
  → tap same card → onPlayCard(seat, card), selectedCard = null
  → tap different legal card → selectedCard = new card
  → tap Cancel chip → selectedCard = null
  → tap outside hand area → selectedCard = null

State: any
  → isSubmitting = true (from Feature 07) → all taps ignored
```

`selectedCard` state lives in `HandFan` / `DummyFan`, **not** in the parent page — the choice is local UI state and does not need to survive re-renders of the page.

### Device detection approach

Use CSS media queries for layout changes (no JS `userAgent` sniffing). The two-tap flow applies to all screen sizes — it is a better UX on desktop too (prevents fat-finger plays) and costs nothing on desktop where hover still raises the card previewing intent.

---

## Tests (exact)

### 1. Unit — two-tap selection (jsdom)

```ts
// __tests__/unit/PlayingTable-touch.test.tsx
// Render HandFan with 5 legal cards. Simulate click on card[0].
// Assert: onPlayCard NOT called. Assert: card[0] has raised transform.
// Simulate click on card[0] again. Assert: onPlayCard called with (seat, card[0]).
// Simulate click card[0] then click card[1]. Assert: card[1] is now selected, card[0] deselected.
// Simulate click card[0] then click Cancel. Assert: nothing selected, onPlayCard not called.
```

### 2. Unit — tap-outside clears selection

```ts
// Select a card. Dispatch touchstart on document (outside hand). Assert selectedCard = null.
```

### 3. Visual regression / Storybook (optional)

Render `<PlayingTable>` at 375 px width. Assert `.bt-hand` has `overflow-x: auto`.

### 4. E2E — mobile viewport

```ts
// playwright.config.ts: add a 'mobile-chrome' project with { viewport: { width: 390, height: 844 } }
// full-game.spec.ts: in mobile-chrome project, assert BiddingBox is not directly visible;
//   assert "Bid" FAB exists; click it; assert BidDrawer opens; make a bid; assert drawer closes.
// Assert card play requires two taps in mobile viewport.
```

### Run before PR

```bash
npm run lint && npm run build
npm run test
npm run test:e2e -- full-game --project=mobile-chrome
# manual: open on real iOS/Android device, play through bidding + one trick
```

---

## Definition of done

- [ ] First tap on a legal card selects/raises it; second tap confirms the play — on all screen sizes.
- [ ] Cancel chip clears selection; tap-outside also clears.
- [ ] `isSubmitting` (Feature 07) blocks all taps while a POST is in-flight.
- [ ] `@media (max-width: 640px)`: hand renders as a horizontal scroll-snap strip, flat layout.
- [ ] `@media (max-width: 640px)`: BiddingBox renders in a bottom-sheet drawer triggered by a FAB.
- [ ] `<BidDrawer>` is accessible: `role="dialog"`, Escape to close, focus trap.
- [ ] No `userAgent` sniffing — layout breakpoints are CSS-only.
- [ ] Two-tap unit tests green. E2E mobile viewport project passes.
