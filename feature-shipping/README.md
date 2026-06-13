# Feature Shipping Plans — Bridge Online

Structured implementation plans for the discussed work (CSS modernization + a family of AI features), plus the feature-flag layer that has to land before any of it. Every AI feature is gated through the same SYS_FUNC flag system (Feature 00) and reuses the serializer/model wrapper built in Feature 02.

> This folder is **gitignored** — local planning notes, not tracked in the repo.

---

## Ship order

| # | Feature | Branch | Status | Flag | Depends on |
|---|---|---|---|---|---|
| 00 | [SYS_FUNC feature flags](./00-sys-func-feature-flags.md) | `feat/sys-func-flags` | ✅ Merged (PR #22) | — | — |
| 01 | [UI modernization](./01-ui-modernization.md) | `feat/ui-dark-premium` | ✅ Merged (PR #22) | `FEATURE_NEW_UI` | 00 |
| 05 | [Playing phase UI](./05-playing-phase-ui.md) | `feat/play-phase-ui` | ✅ Merged (PR #22) | — | 00, 01 |
| 05b | Multi-board / next game | `master` | ✅ Committed | — | 05 |
| 02 | [AI hint system](./02-ai-hint-system.md) | `feat/ai-hint-system` | 📋 Planned | `FEATURE_AI_HINTS` | 00 |
| 03 | [AI bot players](./03-ai-bot-players.md) | `feat/ai-bot-players` | 📋 Planned | `FEATURE_AI_BOTS` | 00, 02 |
| 04 | [AI post-game summary](./04-ai-post-game-summary.md) | `feat/ai-postgame-summary` | 📋 Planned | `FEATURE_AI_SUMMARY` | 00, 02 |
| 06 | [Trick lifecycle UX](./06-trick-lifecycle-ux.md) | `feat/trick-lifecycle` | 📋 Planned | — | 05 |
| 07 | [Play sync + optimistic state](./07-play-sync-optimistic.md) | `feat/play-sync` | 📋 Planned | — | 06 |
| 08 | [Reconnection / disconnect UI](./08-reconnection-ui.md) | `feat/reconnection-ui` | 📋 Planned | `FEATURE_RECONNECT_GRACE` | 00 |
| 09 | [Mobile / touch support](./09-mobile-touch.md) | `feat/mobile-touch` | 📋 Planned | — | 05, 01 |
| 10 | [Score depth & result screen](./10-score-depth.md) | `feat/score-depth` | 📋 Planned | — | 05b |
| 11 | [Auction review during play](./11-auction-review.md) | `feat/auction-review` | 📋 Planned | — | 05 |
| 12 | [Hint button UI](./12-hint-button-ui.md) | `feat/hint-button` | 📋 Planned | `FEATURE_AI_HINTS` | 02, 05 |

### Next up (recommended order)

**P0 — core play loop correctness (do these first, in order):**
```
master (05 + 05b already merged)
  └─ feat/trick-lifecycle ──────► merge (Feature 06)
        └─ feat/play-sync ──────► merge (Feature 07)
```

**P1 — parallel-safe after 05:**
```
  ├─ feat/reconnection-ui         (Feature 08, independent of 06/07)
  ├─ feat/mobile-touch            (Feature 09, independent)
  └─ feat/score-depth             (Feature 10, independent)
```

**P2 — polish (parallel-safe after 05):**
```
  ├─ feat/auction-review          (Feature 11, independent)
  └─ feat/hint-button             (Feature 12, after Feature 02)
```

**AI features (parallel-safe with each other after 02):**
```
master
  └─ feat/ai-hint-system ──────► merge (Feature 02)
        ├─ feat/ai-bot-players          (Feature 03)
        ├─ feat/ai-postgame-summary     (Feature 04)
        └─ feat/hint-button             (Feature 12)
```

### Why 06 before 07
Feature 06 introduces `completedTrick` local state and the `game:trick_completed` payload.
Feature 07's optimistic trick update appends to that same local trick state — it reads the
completed-trick hold timing to know when `isSubmitting` should stay true. Build the hold
mechanism first, then layer optimistic play on top.

**Why 00 first:** every feature flag routes through the registry built in 00.

**Why 02 before 03 & 04:** `lib/ai/gameStateSerializer.ts` + `lib/ai/client.ts` are built
in 02 and reused by both 03 and 04.

---

## Conventions for every branch

- Branch from an up-to-date `master` (`git pull` first).
- One feature per branch, one PR.
- Tests ship **with** the feature, not after — see each plan's "Test cases".
- Gate user-facing changes behind a `FEATURE_*` flag during rollout.
- Before opening a PR: `npm run lint && npm run test && npm run build` (add `test:e2e` for UI/route work).

## Switching coding models

Sonnet for implementation (fast, strong on code); switch to Opus for gnarly architecture/reasoning calls (e.g. the AI prompt design or Bridge game logic). Switchable mid-conversation in settings.

## Test commands (from `package.json`)

```
npm run test        # vitest unit
npm run test:db     # db suite (needs test:db:start)
npm run test:socket # socket suite
npm run test:e2e    # playwright
npm run test:all    # everything
```
