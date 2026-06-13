# BaseFeatureManager — BridgeOnline Feature Registry

Central registry for all features. Planning docs moved to `D:/dev/ProjectsTodos/BridgeOnlineNEXTJS/`.

---

## Features overview

| # | Feature | Branch | Flag | Status | Notes |
|---|---|---|---|---|---|
| 00 | SYS_FUNC feature flags | `feat/sys-func-flags` | — | ✅ Merged to master via PR #22 | `lib/features.ts`, `lib/features.server.ts` |
| 01 | UI modernization / dark theme | `feat/ui-dark-premium` | `FEATURE_NEW_UI` | ✅ Merged to master via PR #22 | All pages restyled |
| 02 | AI hint system | `feat/ai-hint-system` | `FEATURE_AI_HINTS` | 📋 Planned | Requires `lib/ai/` client + serializer |
| 03 | AI bot players | `feat/ai-bot-players` | `FEATURE_AI_BOTS` | 📋 Planned | Depends on 02 |
| 04 | AI post-game summary | `feat/ai-postgame-summary` | `FEATURE_AI_SUMMARY` | 📋 Planned | Depends on 02 |
| 05 | Playing table UI + multi-board | `feat/playing-table` | — | ✅ Merged to master via PR #22 `0fb4cc0` | `PlayingTable.tsx`, scoreboard, auto-next |
| 06 | Trick lifecycle UX | `feat/trick-lifecycle` | — | ✅ Implemented `f18f183` | Hold 4 cards + winner pulse for 1.5s |
| 07 | Play sync + optimistic | `feat/play-sync` | — | ✅ Implemented `3afa987` | Optimistic trick, error toasts, isSubmitting |
| 08 | Reconnection UI | `feat/reconnection-ui` | `FEATURE_RECONNECT_GRACE` | ✅ Implemented `3e53656` | 30s grace, DisconnectBanner |
| 09 | Mobile / touch support | `feat/mobile-touch` | — | ✅ Implemented `9061e51` | Two-tap, scroll-snap, BidDrawer |
| 10 | Score depth & result screen | `feat/score-depth` | — | ✅ Implemented `c279a44` | ScoreCard, vulnerability marks, boardScores |
| 11 | Auction review during play | `feat/auction-review` | — | ✅ Implemented `12ff255` | AuctionDrawer, felt contract chip |
| 12 | Hint button UI | `feat/hint-button` | `FEATURE_AI_HINTS` | ✅ Implemented `c9b2b6d` | HintButton component (route is Feature 02) |

### Implementation order
```
P0 (core correctness):  06 → 07
P1 (UX + polish):       08 → 09 → 10
P2 (polish):            11 → 12
AI (planned):           02 → 03, 04
```

---

## Client vs Server state design

| State | Owner | Why |
|---|---|---|
| All 4 hands (card data) | **Server** | Must filter per POV |
| Current trick state | **Server** | Single source of truth |
| Completed tricks & winners | **Server** | Trick winner determination |
| Turn / whose play | **Server** | Enforces order |
| Contract & trump | **Server** | Suit-following validation |
| Move log (`game_moves`) | **Server** | Audit trail |
| Viewer's hand | **Client** | From `GET /api/games/:id` |
| Dummy's hand | **Client** | Only after opening lead |
| Legal card highlights | **Client** | `isValidPlay()` |
| Table settings | **Client** | localStorage |
| Optimistic trick | **Client** | Feature 07 — rolled back on error |
| Trick visual hold | **Client** | Feature 06 — 1.5s then refetch |

---

## Build tooling
| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (Next.js + Socket.io) |
| `npx tsc --noEmit` | TypeScript check |
| `npx prisma db push` | Sync schema to DB |
| `npx prisma generate` | Generate Prisma client |
