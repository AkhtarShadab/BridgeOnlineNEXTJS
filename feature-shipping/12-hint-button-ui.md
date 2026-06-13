# Feature 12 — Hint Button UI

> **Ship order: after 02** (AI hint route implemented) and **05** (game page structure). Gated behind `FEATURE_AI_HINTS` (same flag as Feature 02). Branch off `master`.

---

## Goal

`/api/games/[gameId]/hint` exists as a stub from Feature 00 and is fully implemented in Feature 02, but nothing in the frontend calls it. A "Get Hint" button during your turn is a one-component addition.

After this ships: a "Get Hint" button appears beside the player's hand when `FEATURE_AI_HINTS` is on and it is the viewer's turn. Clicking it shows a loading state, then displays the suggestion and reasoning in an expandable panel below the hand. The button is hidden/disabled when it is not the viewer's turn and when the flag is off.

## Branch

```bash
git checkout master && git pull     # Features 02 + 05 merged
git checkout -b feat/hint-button
```

---

## Current state (verified in code)

**`app/api/games/[gameId]/hint/route.ts`** — Stub exists (registered in Feature 00). Full implementation is Feature 02's scope. This feature wires the UI to the completed route.

**`components/game/HintButton.tsx`** — Does not exist.

**`app/game/[gameId]/page.tsx`**
- No `HintButton` import or usage.
- `isEnabled("aiHints")` is available but unused in this file.

**Feature 02 response contract:**
```ts
POST /api/games/:id/hint
→ 200: { suggestion: string; reasoning: string }
→ 403: feature disabled or not player's turn / seat
→ 401: not authenticated
```

---

## Files to change (exact)

| # | File | Change |
|---|---|---|
| 1 | `components/game/HintButton.tsx` | **New.** Full spec below. |
| 2 | `app/game/[gameId]/page.tsx` | Import `HintButton`. Render `<HintButton gameId={gameId} disabled={!isMyTurn} phase={game.phase} />` during BIDDING and PLAYING phases, gated on `isEnabled("aiHints")`. Place it adjacent to the hand display, below the "Your Hand" heading. |

### `HintButton` component spec

```tsx
interface HintButtonProps {
  gameId: string;
  disabled: boolean;         // true when not the viewer's turn
  phase: 'BIDDING' | 'PLAYING';
}
```

**States:**
1. **Idle** — "Get Hint 💡" button. Disabled + dimmed when `disabled=true`.
2. **Loading** — spinner replaces icon; button disabled; "Thinking…" text.
3. **Result** — button returns to idle. Expandable panel appears below showing `suggestion` (bold, prominent) and `reasoning` (smaller, muted). Panel has a "×" dismiss button.
4. **Error** — small red inline error message below the button; no panel. Auto-clears after 5 s.

**Behaviour:**
- Clicking while `disabled=true` is a no-op (both CSS `disabled` attribute and JS guard).
- New hint request dismisses any open result panel first.
- Does **not** auto-request — viewer explicitly clicks.
- One in-flight request at a time (loading state prevents double-click).

```tsx
export default function HintButton({ gameId, disabled, phase }: HintButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'result' | 'error'>('idle');
  const [hint, setHint] = useState<{ suggestion: string; reasoning: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const requestHint = async () => {
    if (disabled || state === 'loading') return;
    setState('loading');
    setHint(null);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/games/${gameId}/hint`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setHint(data);
        setState('result');
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Could not get hint');
        setState('error');
        setTimeout(() => setState('idle'), 5000);
      }
    } catch {
      setErrorMsg('Network error');
      setState('error');
      setTimeout(() => setState('idle'), 5000);
    }
  };

  return (
    <div data-testid="hint-button-container">
      <button
        data-testid="hint-button"
        onClick={requestHint}
        disabled={disabled || state === 'loading'}
        className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors
          ${disabled ? 'opacity-40 cursor-not-allowed border-border text-text-muted' :
            'border-accent text-accent hover:bg-accent/10'}`}
      >
        {state === 'loading' ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin w-4 h-4" .../>  Thinking…
          </span>
        ) : 'Get Hint 💡'}
      </button>

      {state === 'result' && hint && (
        <div data-testid="hint-panel" className="mt-3 p-4 bg-surface-elevated border border-border rounded-xl">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-accent uppercase tracking-wide">
              {phase === 'BIDDING' ? 'Suggested Bid' : 'Suggested Play'}
            </span>
            <button onClick={() => setState('idle')} className="text-text-muted hover:text-foreground">×</button>
          </div>
          <p className="text-lg font-bold text-foreground mb-2">{hint.suggestion}</p>
          <p className="text-sm text-text-muted">{hint.reasoning}</p>
        </div>
      )}

      {state === 'error' && errorMsg && (
        <p data-testid="hint-error" className="mt-2 text-sm text-red-400">{errorMsg}</p>
      )}
    </div>
  );
}
```

---

## Tests (exact)

### 1. Unit — idle/loading/result/error states

```ts
// __tests__/unit/HintButton.test.tsx (new)
// Mock fetch.

// Idle: assert button text "Get Hint 💡", not disabled when disabled=false.
// Disabled prop: assert button has disabled attribute, click does nothing.

// Loading: click button, assert "Thinking…" immediately (before fetch resolves).
// Assert second click during loading is ignored (fetch called once).

// Result: resolve fetch with { suggestion: "4♠", reasoning: "..." }.
// Assert data-testid="hint-panel" visible; suggestion text present.
// Click ×: assert panel gone, state back to idle.

// Error: reject fetch. Assert data-testid="hint-error" visible.
// Advance 5 s with vi.useFakeTimers. Assert error clears automatically.
```

### 2. Unit — disabled=true blocks request

```ts
// Render with disabled=true. Click button. Assert fetch never called.
```

### 3. Integration — mounted in page (not-my-turn)

```ts
// Render page.tsx with isMyTurn=false and FEATURE_AI_HINTS=true.
// Assert hint-button present but disabled.
```

### 4. Feature flag off

```ts
// vi.stubEnv('NEXT_PUBLIC_FEATURE_AI_HINTS', 'false').
// Render page. Assert data-testid="hint-button-container" absent.
```

### 5. E2E (optional — requires mock AI provider from Feature 02)

```ts
// FEATURE_AI_HINTS=true, AI_PROVIDER=mock.
// Reach bidding phase. Assert hint-button visible and enabled on viewer's turn.
// Click. Assert hint-panel appears with non-empty suggestion.
// Assert hint-button absent when flag off.
```

### Run before PR

```bash
npm run lint && npm run build
npm run test
npm run test:e2e -- ai-hint   # if mock provider available
```

---

## Definition of done

- [ ] `<HintButton>` renders only when `isEnabled("aiHints")` — absent when flag is off.
- [ ] Button disabled (visually + functionally) when `disabled=true` (not viewer's turn).
- [ ] Loading state shows spinner + "Thinking…"; prevents double-click.
- [ ] Result panel shows `suggestion` and `reasoning`; dismissible with ×.
- [ ] Error state shows message, auto-clears after 5 s.
- [ ] `data-testid="hint-button"` and `data-testid="hint-panel"` present for test/E2E targeting.
- [ ] Unit tests cover all four states + disabled guard + flag-off absence.
- [ ] No AI key exposed to the client bundle (`npm run build` confirms).
