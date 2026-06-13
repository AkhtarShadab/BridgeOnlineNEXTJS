# Feature 07 — Play Sync + Optimistic State

> **Ship order: after 06** (trick lifecycle gives clean event payloads to act on). No flag. Branch off `master`.

---

## Goal

The current `onPlayCard` flow has two problems: (1) the viewer's card doesn't appear until a full REST round-trip completes (~200 ms+), making the table feel sluggish, and (2) if the server rejects a play the card silently doesn't move — no error is surfaced. There is also no guard against double-submits.

After this ships: the viewer's own card appears on the table immediately (optimistic), a loading guard prevents double-clicks, server errors roll back the optimistic state and show a dismissible toast, and the REST refetch on success authorizes the final state.

## Branch

```bash
git checkout master && git pull     # Features 05 + 06 merged
git checkout -b feat/play-sync
```

---

## Current state (verified in code)

**`app/game/[gameId]/page.tsx` — `onPlayCard` in PlayingTable**
```ts
onPlayCard={(seat, card) => {
  fetch(`/api/games/${gameId}/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card }),
  }).then(fetchGameState);
}}
```
- No `await` / no error branch — a 400 from the server is silently swallowed.
- No `isSubmitting` guard — rapid clicks can dispatch two concurrent POSTs.
- No optimistic update — card stays in hand until refetch returns.

**`components/game/PlayingTable.tsx`**
- `legalCards` prop dims illegal cards; no `isSubmitting` concept.
- `onPlayCard` prop is `(seat, card) => void` — caller decides async behaviour.

---

## Files to change (exact)

| # | File | Change |
|---|---|---|
| 1 | `app/game/[gameId]/page.tsx` | Add `isSubmitting` state (`boolean`, default `false`). |
| 2 | `app/game/[gameId]/page.tsx` | Add `optimisticTrick` state: `PlayedCard[] \| null` (null = use server state). |
| 3 | `app/game/[gameId]/page.tsx` | Replace inline `onPlayCard` lambda with `handlePlayCard(seat, card)` async function (see flow below). |
| 4 | `app/game/[gameId]/page.tsx` | Pass `trick={optimisticTrick ?? trickCards}` and `isSubmitting={isSubmitting}` to `<PlayingTable>`. |
| 5 | `components/game/PlayingTable.tsx` | Add optional `isSubmitting?: boolean` prop. When true: disable all card `onClick` and dim the entire hand with `opacity-50 pointer-events-none` to prevent double-play. |
| 6 | `app/game/[gameId]/page.tsx` | Add minimal `useToast` hook + `<ToastStack>` overlay (no external library — see spec below). |

### `handlePlayCard` flow

```ts
const handlePlayCard = async (seat: Seat, card: string) => {
  if (isSubmitting) return;                         // guard double-click
  setIsSubmitting(true);

  // Optimistic: add card to trick immediately
  const optimistic = [...trickCards, { seat, card }];
  setOptimisticTrick(optimistic);

  try {
    const res = await fetch(`/api/games/${gameId}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card }),
    });

    if (res.ok) {
      await fetchGameState();          // server state replaces optimistic
    } else {
      const data = await res.json();
      setOptimisticTrick(null);        // rollback
      addToast(data.error || 'Illegal play', 'error');
    }
  } catch {
    setOptimisticTrick(null);          // rollback on network error
    addToast('Network error — try again', 'error');
  } finally {
    setIsSubmitting(false);
  }
};
```

### `useToast` hook spec

```ts
// inline in page.tsx or lib/hooks/useToast.ts
type Toast = { id: string; message: string; type: 'error' | 'info' };

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };
  return { toasts, addToast };
}
```

`<ToastStack>` renders fixed bottom-right, z-50. Each toast: dark surface, red border for errors, auto-dismiss after 4 s with an X button for immediate dismiss.

### Interaction with Feature 06 (trick lifecycle)

When `completedTrick` is set (trick hold phase from Feature 06), `isSubmitting` must also be true for that duration — no new card can be clicked while a trick is being animated out. Coordinate by keeping `isSubmitting` true until after `fetchGameState()` resolves in both paths.

---

## Tests (exact)

### 1. Unit — optimistic state & rollback

```ts
// __tests__/unit/play-sync.test.ts
// Mock fetch. Fire handlePlayCard.
// Assert: setOptimisticTrick called with [...trickCards, newCard] before fetch resolves.
// Simulate 400 response: assert setOptimisticTrick(null) called (rollback).
// Simulate network error: assert setOptimisticTrick(null) called.
// Assert: isSubmitting is false in both error paths after resolution.
```

### 2. Unit — double-click guard

```ts
// Call handlePlayCard twice rapidly (second call while isSubmitting = true).
// Assert: fetch called exactly once (second call short-circuits).
```

### 3. Unit — toast dismiss

```ts
// vi.useFakeTimers. addToast('msg', 'error'). Advance 4000 ms. Assert toast gone.
// Click X button. Assert toast removed immediately.
```

### 4. Component — PlayingTable isSubmitting

```ts
// Render <PlayingTable isSubmitting={true} .../>
// Assert hand container has pointer-events-none / opacity-50.
// Assert onClick is not fired when card is clicked in this state.
```

### Run before PR

```bash
npm run lint && npm run build
npm run test
npm run test:e2e -- full-game
# manual: click a card quickly twice — assert only one POST fires in Network tab
# manual: click an illegal card (via browser console) — assert toast appears, card stays in hand
```

---

## Definition of done

- [ ] Viewer's own card appears on the trick immediately on click (before POST returns).
- [ ] `isSubmitting` guard: second click while POST is in-flight is a no-op; PlayingTable dims during submission.
- [ ] Server error (400) rolls back optimistic state and shows toast — no silent failure.
- [ ] Network error path also rolls back and toasts.
- [ ] `fetchGameState()` on success replaces optimistic state with authoritative snapshot.
- [ ] `<ToastStack>` renders fixed overlay, auto-dismisses after 4 s, has manual X dismiss.
- [ ] Unit tests cover: optimistic set, rollback on error, double-click guard, toast lifecycle.
- [ ] `isSubmitting` stays true during Feature 06 trick-hold window (no new plays during animation).
