# BaseFeatureManager — BridgeOnline Feature Registry

Central registry for all features across the BridgeOnline project.
Tracks branch, flag, status, and dependencies.

---

## Features overview

| # | Feature | Branch | Flag | Status | Depends on |
|---|---|---|---|---|---|
| 00 | SYS_FUNC feature flags | `feat/sys-func-flags` | — | ✅ Merged to master via PR #22 | — |
| 01 | UI modernization / dark theme | `feat/ui-dark-premium` | `FEATURE_NEW_UI` | ✅ Merged to master via PR #22 | 00 |
| 02 | AI hint system | `feat/ai-hint-system` | `FEATURE_AI_HINTS` | 📋 Planned | 00 |
| 03 | AI bot players | `feat/ai-bot-players` | `FEATURE_AI_BOTS` | 📋 Planned | 00, 02 |
| 04 | AI post-game summary | `feat/ai-postgame-summary` | `FEATURE_AI_SUMMARY` | 📋 Planned | 00, 02 |
| 05 | Playing table UI | `feat/playing-table` | — | ✅ Merged to master via PR #22 | 00, 01 |
| 05b | Multi-board / next game | `master` (committed) | — | ✅ Implemented | 05 |
| 06 | Trick lifecycle UX | `feat/trick-lifecycle` | — | 📋 Planned | 05 |
| 07 | Play sync + optimistic state | `feat/play-sync` | — | 📋 Planned | 05, 06 |
| 08 | Reconnection / disconnect UI | `feat/reconnection-ui` | `FEATURE_RECONNECT_GRACE` | 📋 Planned | 00 |
| 09 | Mobile / touch support | `feat/mobile-touch` | — | 📋 Planned | 05, 01 |
| 10 | Score depth & result screen | `feat/score-depth` | — | 📋 Planned | 05b |
| 11 | Auction review during play | `feat/auction-review` | — | 📋 Planned | 05 |
| 12 | Hint button UI | `feat/hint-button` | `FEATURE_AI_HINTS` | 📋 Planned | 02, 05 |

---

## 00 — SYS_FUNC feature flags

- **Branch:** `feat/sys-func-flags`
- **Flag:** None (the system itself)
- **Status:** ✅ Implemented, not merged to master

### Files
| File | Description |
|---|---|
| `lib/features.ts` | Exports `features`, `isEnabled()`, `FeatureFlag` type |
| `lib/features.server.ts` | Exports `featureGate()` returning 403 NextResponse when off |
| `.env.example` | Documents all `FEATURE_*` + `NEXT_PUBLIC_FEATURE_*` vars |

### Flags defined
| Flag | Type | Default | Purpose |
|---|---|---|---|
| `voiceChat` | public | `true` | Toggle WebRTC voice UI + hook |
| `aiHints` | server | `false` | Gate AI hint route + button (Features 02, 12) |
| `newUI` | public | `false` | Toggle dark/premium theme (Feature 01) |
| `reconnectGrace` | server | `false` | 30s disconnect grace window + UI banner (Feature 08) |

### Key design
- `lib/features.ts` is the **only** file that reads `process.env.FEATURE_*` / `process.env.NEXT_PUBLIC_FEATURE_*`
- Server flags use `FEATURE_*`; client-visible flags also need `NEXT_PUBLIC_` twin
- `featureGate(f)` returns `null` when enabled, `NextResponse.json({error}, 403)` when disabled
- Tests use `vi.stubEnv` + `vi.resetModules` for per-case env injection

---

## 01 — UI modernization / dark premium theme

- **Branch:** `feat/ui-dark-premium`
- **Flag:** `FEATURE_NEW_UI` / `NEXT_PUBLIC_FEATURE_NEW_UI`
- **Status:** ✅ Implemented, not merged to master

### What changed
- Full token system in `app/globals.css` (`--surface`, `--accent`, `--felt`, `--text`, etc.)
- `darkMode: 'class'` in `tailwind.config.ts`
- Inter + Playfair Display fonts via `next/font/google`
- All pages restyled: login, register, dashboard, create/join room, room lobby, game page, error/loading/404 states
- `BiddingBox` restyled with new tokens
- Voice components (`PlayerVoiceBadge`, `VoiceParticipant`) updated
- SVG suit icons replacing `♠♥♦♣` char glyphs
- `data-testid` hooks for e2e tests (`turn-ring`, `stats-strip`)

### Design tokens
```
--felt:       #0a1628    (deep navy felt)
--accent:     #38bdf8    (sky blue)
--surface:    #0f1a2e    (card surface)
--border:     #1e3a5f    (subtle borders)
--suit-red:   #f87171    (♥ ♦)
--suit-black: #e2e8f0    (♠ ♣ on dark bg)
```

---

## 02 — AI hint system

- **Branch:** `feat/ai-hint-system` (not yet created)
- **Flag:** `FEATURE_AI_HINTS`
- **Status:** 📋 Planned, not started

### Scope
- `lib/ai/gameStateSerializer.ts` — serialize current game state to AI prompt
- `lib/ai/client.ts` — model wrapper with timeout + error handling
- `/api/games/[gameId]/hint/route.ts` — stub exists (Feature 00), needs implementation
- `components/game/HintButton.tsx` — UI for "Get Hint"

### Reused by
- Feature 03 (bot players) — auto-applied hints as moves
- Feature 04 (post-game summary) — whole-game serializer

---

## 03 — AI bot players

- **Branch:** `feat/ai-bot-players` (not yet created)
- **Flag:** `FEATURE_AI_BOTS`
- **Status:** 📋 Planned

### Scope
- Bot fills empty seat; computes bids/cards server-side via AI model
- Reuses `serializeForHint` + `getHint`-style wrapper from Feature 02
- Emits same socket events as human client

---

## 04 — AI post-game summary

- **Branch:** `feat/ai-postgame-summary` (not yet created)
- **Flag:** `FEATURE_AI_SUMMARY`
- **Status:** 📋 Planned

### Scope
- "Analyze Game" button shown after `phase = COMPLETED`
- AI returns: optimal contract, key mistakes, alternative lines
- Extends Feature 02 serializer to whole-game view

---

## 05 — Playing table UI

- **Branch:** `feat/playing-table` (current)
- **Flag:** None (rendered during `game.phase === 'PLAYING'`)
- **Status:** ✅ Implemented

### Files
| File | Description |
|---|---|
| `components/game/PlayingTable.tsx` | 3D POV bridge table — NO game logic, purely presentational |
| `components/game/playing-table.css` | All styles prefixed `bt-`, inherits theme tokens |
| `app/api/games/[gameId]/route.ts` | Added `declarerSeat`, `dummySeat`, `handCounts` to GET response |
| `app/api/games/[gameId]/play/route.ts` | Added socket broadcasts for `game:card_played`, `game:trick_completed`, `game:completed` |
| `app/game/[gameId]/page.tsx` | Renders `<PlayingTable>` during PLAYING phase + table settings panel |

### Component interface
```
<PlayingTable
  viewerSeat: "N"|"E"|"S"|"W"    // viewer always at bottom
  declarer: "N"|"E"|"S"|"W"
  trump: "S"|"H"|"D"|"C"|"NT"
  dummyRevealed: boolean          // after opening lead
  hands: { [seat]: string[] }     // viewer + dummy face-up
  handCounts: { [seat]: number }  // others shown as card backs
  trick: { seat, card }[]         // current trick
  turn: "N"|"E"|"S"|"W"|null
  legalCards: string[]|null       // glowing highlights
  tricksWon: { NS, EW }
  onPlayCard: (seat, card) => void
  fanStyle?: "fan"|"tilt"|"flat"
  rake?: number
  speed?: number
/>
```

### Fixed issues (included in this branch)
- **Suit colors:** Card face uses hardcoded `#1a1a1a` for black suits (spades/clubs) — visible on cream card background
- **Turn indicator text:** Phase-aware — "bid" vs "play"
- **Card 3D overlap:** Perspective moved from `.bt-stage` to `.bt-scene` so hand/dummy render outside 3D table context
- **Stage height:** Increased to `clamp(600px, 85vh, 960px)` for fan arc clearance
- **Table settings panel:** Collapsible UI for fan style / rake / speed, persisted in localStorage
- **Tricks scoreboard:** Floating `NS / EW` display in table center

### Multi-board / next game (05b)

**Implemented on:** `master` (commit `0fb4cc0`)

After a game reaches `COMPLETED` phase, the play route checks `numBoards` in
`GameRoom.settings`. If more boards remain:

1. `startNextBoard()` creates a new `Game` record with `boardNumber + 1`
2. Fresh cards dealt, new dealer/vulnerability calculated
3. All players linked to the new game
4. Socket emits `game:next_board` with the new `gameId`
5. Frontend listens for `game:completed` (shows score + 3s countdown)
6. Frontend listens for `game:next_board` (redirects immediately)

### Build tooling
| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (Next.js + Socket.io) |
| `npx tsc --noEmit` | TypeScript check |
| `npx prisma db push` | Sync schema to DB |
| `npx prisma generate` | Generate Prisma client |

---

---

## 06 — Trick lifecycle UX

- **Branch:** `feat/trick-lifecycle` (not yet created)
- **Flag:** None
- **Status:** 📋 Planned
- **Priority:** P0 — core gameplay feel

### Problem
The server emits `game:trick_completed` but the frontend never listens for it. Every event
triggers a full `fetchGameState()`, which returns a state where the trick is already cleared.
Players never see the completed 4-card trick, who won it, or any collection animation.

### Scope
| File | Change |
|---|---|
| `app/game/[gameId]/page.tsx` | Add `game:trick_completed` socket listener |
| `app/game/[gameId]/page.tsx` | Local `completedTrick` state: hold 4 cards for ~1500ms before re-fetching |
| `components/game/PlayingTable.tsx` | Accept `trickWinner?: Seat` prop — flash winner seat ring |
| `components/game/PlayingTable.tsx` | CSS keyframe `bt-anim-collect-{N,E,S,W}`: cards slide toward winner |
| `components/game/playing-table.css` | 4 directional collect keyframes |

### Event payload (server already sends)
```ts
// game:trick_completed
{ gameId: string; winningSeat: string; trickCards: { seat: string; card: string }[] }
```

### State machine in the page
```
trick_completed received
  → setCompletedTrick({ cards, winner })   // hold for display
  → setTimeout(1500, () => {
      setCompletedTrick(null)
      fetchGameState()                      // clears trick, updates counts
    })
```

### Why not optimistic state here
Trick winner requires trump/suit-follow logic; cheaper to let the server confirm and
hold the completed trick visually for the delay window.

---

## 07 — Play sync + optimistic state

- **Branch:** `feat/play-sync` (not yet created)
- **Flag:** None
- **Status:** 📋 Planned
- **Priority:** P0 — UX latency + error handling
- **Depends on:** 06 (trick lifecycle gives clean event payloads to act on)

### Problem
The current `onPlayCard` handler has no error handling — if the server rejects a play the
card silently doesn't move. Also every socket event causes a full REST round-trip before the
viewer sees their own card appear (~200ms+).

### Scope
| File | Change |
|---|---|
| `app/game/[gameId]/page.tsx` | Optimistic: add played card to `trick` state immediately on click |
| `app/game/[gameId]/page.tsx` | On POST error: rollback optimistic trick, show toast with server error message |
| `app/game/[gameId]/page.tsx` | Replace bare `.then(fetchGameState)` with try/catch + rollback |
| `app/game/[gameId]/page.tsx` | Add `isSubmitting` flag to disable card clicks while POST is in-flight |
| `components/game/PlayingTable.tsx` | Accept `isSubmitting?: boolean` prop — disable all clicks when true |

### Optimistic flow
```
click legal card
  → setOptimisticTrick([...trick, {seat: viewer, card}])
  → setIsSubmitting(true)
  → POST /api/games/:id/play
      ok  → fetchGameState() (server state replaces optimistic)
      err → rollback optimisticTrick, setIsSubmitting(false), toast(error)
```

### Toast system
Add a minimal `useToast` hook (array of `{id, message, type}` in state, auto-dismiss 4s).
Render a `ToastStack` overlay in game page. No external library needed.

---

## 08 — Reconnection / disconnect UI

- **Branch:** `feat/reconnection-ui` (not yet created)
- **Flag:** `FEATURE_RECONNECT_GRACE` / `NEXT_PUBLIC_FEATURE_RECONNECT_GRACE`
- **Status:** 📋 Planned
- **Priority:** P1 — game is unplayable when a seat silently vanishes

### Problem
The design doc specifies a 30s Redis reconnection grace window (P1 scalability item), but the
game page has zero UI for it: no "opponent disconnected" banner, no grace countdown, and no
indicator when the viewer's own socket drops.

### Scope
| File | Change |
|---|---|
| `lib/features.ts` | Add `reconnectGrace` flag |
| `.env.example` | Document `FEATURE_RECONNECT_GRACE` |
| `lib/socket/register-handlers.js` | Emit `game:player_disconnected` / `game:player_reconnected` with `{ userId, seat, graceEndsAt }` |
| `server/index.js` | On socket `disconnect`: set Redis TTL key `player:disconnected:{userId}` = 30s; emit `game:player_disconnected` |
| `server/index.js` | On socket reconnect (join-game event): clear key; emit `game:player_reconnected` |
| `app/game/[gameId]/page.tsx` | Listen to both events; maintain `disconnectedPlayers: Map<seat, graceEndsAt>` state |
| `components/game/DisconnectBanner.tsx` | New component: amber banner listing disconnected seats with live countdown |
| `app/game/[gameId]/page.tsx` | Own-socket dropped indicator (socket `connect_error` / `disconnect` events) |

### Banner design
```
⚠ East (Alice) disconnected — reconnecting… 00:24
    [Waiting for reconnection]
```
If grace period expires without reconnect → full banner: "East left the game. Returning to lobby."

---

## 09 — Mobile / touch support

- **Branch:** `feat/mobile-touch` (not yet created)
- **Flag:** None
- **Status:** 📋 Planned
- **Priority:** P1 — design doc breakpoints are unimplemented

### Problem
`PlayingTable` uses `onMouseEnter`/`onMouseLeave` for card raise — hover doesn't exist on
touch, so on mobile the first tap fires a play with no preview. The design doc specifies
vertical layout, modal bid grid, and swipeable hand under 640px; none are implemented.

### Scope
| File | Change |
|---|---|
| `components/game/PlayingTable.tsx` | Two-tap selection: first tap → `selectedCard` state (raise) → second tap confirms → `onPlayCard` |
| `components/game/PlayingTable.tsx` | Deselect on tap-outside via `useEffect` window listener |
| `components/game/playing-table.css` | `@media (max-width: 640px)` — vertical stacked layout, `.bt-stage` height auto |
| `components/game/BiddingBox.tsx` | `@media (max-width: 640px)` — render as bottom-sheet modal overlay |
| `app/game/[gameId]/page.tsx` | `@media (max-width: 640px)` — single column, bid grid as modal triggered by floating button |
| `components/game/PlayingTable.tsx` | Swipeable hand strip on mobile using CSS `scroll-snap-type: x mandatory` |

### Touch card selection state machine
```
idle → tap legal card → selected (card raises, Cancel button appears)
selected → tap same card → onPlayCard fired → idle
selected → tap different legal card → new selection
selected → tap cancel / tap outside → idle
```

---

## 10 — Score depth & result screen

- **Branch:** `feat/score-depth` (not yet created)
- **Flag:** None
- **Status:** 📋 Planned
- **Priority:** P1 — current COMPLETED screen shows only raw NS/EW totals

### Problem
COMPLETED phase shows only `scoreNS` / `scoreEW`. Missing: contract result line,
tricks taken vs. needed, vulnerability display during play, cumulative board scores,
and `window.location.href` hard-reloads to next board instead of `router.push`.

### Scope
| File | Change |
|---|---|
| `app/api/games/[gameId]/route.ts` | Add `result` object to GET response: `{ contractMade, tricksNeeded, tricksTaken, overtricks, undertricks, points, doubled, redoubled }` |
| `app/game/[gameId]/page.tsx` | Replace COMPLETED section with `<ScoreCard>` component |
| `components/game/ScoreCard.tsx` | New component: contract line ("4♠ by South, made +1"), score breakdown, vulnerability indicator, board-N-of-M |
| `components/game/ScoreCard.tsx` | Cumulative score table (all completed boards in session, pulled from `game.boardScores`) |
| `app/api/games/[gameId]/route.ts` | Add `boardScores: { boardNumber, scoreNS, scoreEW, contract, result }[]` from game history |
| `app/game/[gameId]/page.tsx` | Fix `window.location.href` → `router.push` for next board navigation |
| `components/game/PlayingTable.tsx` | Vulnerability indicators on table felt (red corner flashes for NS/EW when vulnerable) |

### Contract result line format
```
4♠ by South   made +1   +650   (NS vul)
```
Undertrick: `3NT by West   down 2   −200`

---

## 11 — Auction review during play

- **Branch:** `feat/auction-review` (not yet created)
- **Flag:** None
- **Status:** 📋 Planned
- **Priority:** P2 — UX polish

### Problem
Once PLAYING starts, the full auction table still renders above the 3D table, eating vertical
space. Defenders need quick access to the auction; declarers less so. No compact contract chip
sits on the table itself.

### Scope
| File | Change |
|---|---|
| `app/game/[gameId]/page.tsx` | During PLAYING phase, replace full auction panel with collapsible `<AuctionDrawer>` |
| `components/game/AuctionDrawer.tsx` | New: compact contract chip (`4♠ · S · vul`) that expands to full bid table on click |
| `components/game/PlayingTable.tsx` | Add `contract?: { level, suit, by: Seat, doubled?: boolean }` prop — render as center-felt chip |

---

## 12 — Hint button UI

- **Branch:** `feat/hint-button` (not yet created)
- **Flag:** `FEATURE_AI_HINTS` (same as Feature 02)
- **Status:** 📋 Planned
- **Priority:** P2 — API route already exists, UI is the only missing piece
- **Depends on:** 02 (hint route implementation), 05

### Problem
`/api/games/[gameId]/hint` exists but nothing in the frontend calls it.

### Scope
| File | Change |
|---|---|
| `components/game/HintButton.tsx` | New: "Get Hint" button — disabled when not your turn, shows loading spinner, renders hint in expandable panel below hand |
| `app/game/[gameId]/page.tsx` | Mount `<HintButton>` during BIDDING and PLAYING phases, gated on `isEnabled("aiHints")` |
| `app/api/games/[gameId]/hint/route.ts` | Implement hint logic (Feature 02 scope) |

### Component interface
```tsx
<HintButton
  gameId={string}
  disabled={!isMyTurn}
  phase={"BIDDING" | "PLAYING"}
/>
```

---

## Client vs Server state design

| State | Owner | Why |
|---|---|---|
| All 4 hands (card data) | **Server** | Must filter per POV; never send other players' cards |
| Current trick state | **Server** | Single source of truth for play order |
| Completed tricks & winners | **Server** | Trick winner determination, game completion |
| Turn / whose play | **Server** | Enforces order, prevents double-plays |
| Contract & trump | **Server** | Needed for suit-following validation |
| Move log (`game_moves`) | **Server** | Audit trail for replay / dispute |
| Viewer's hand (subset) | **Client** | Received from `GET /api/games/:id` |
| Dummy's hand (conditionally) | **Client** | Only after opening lead |
| Legal card highlights | **Client** | Computed via `isValidPlay()` — cheap, safe |
| POV rotation | **Client** | Fixed: viewer at bottom |
| Table appearance settings | **Client** | localStorage — cosmetic only |
| Current trick display | **Client** | Mapped from server state for animation |

### Recovery design (current — pre Feature 07)
Never optimistically update local state. Always:
1. `POST /api/games/:id/play` → server validates & commits
2. Server returns `{ success }` or `{ error }`
3. Client calls `GET /api/games/:id` (re-fetch authoritative state)
4. Server socket-broadcasts `game:card_played` to other players
5. Other clients receive socket event → re-fetch

### Recovery design (target — Feature 07)
Viewer's own card is optimistically added to local trick state for immediate feedback.
Server is still the single source of truth; optimistic state is replaced on re-fetch or
rolled back on error.
1. Click legal card → optimistically prepend `{seat: viewer, card}` to local trick state
2. `POST /api/games/:id/play` in parallel
3. **On success:** `GET /api/games/:id` replaces optimistic state with authoritative snapshot
4. **On error:** rollback local trick state, show toast with server error message
5. Server socket-broadcasts `game:card_played` to other players (unchanged)
6. `game:trick_completed` → hold visual trick for 1500ms (Feature 06), then re-fetch
