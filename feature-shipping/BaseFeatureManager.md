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
| `aiHints` | server | `false` | Gate AI hint route (Feature 02) |
| `newUI` | public | `false` | Toggle dark/premium theme (Feature 01) |

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

### Recovery design
Never optimistically update local state. Always:
1. `POST /api/games/:id/play` → server validates & commits
2. Server returns `{ success }` or `{ error }`
3. Client calls `GET /api/games/:id` (re-fetch authoritative state)
4. Server socket-broadcasts `game:card_played` to other players
5. Other clients receive socket event → re-fetch
