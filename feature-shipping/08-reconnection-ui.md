# Feature 08 — Reconnection / Disconnect UI

> **Ship order: after 05**, independent of 06/07. Gated behind `FEATURE_RECONNECT_GRACE`. Branch off `master`.

---

## Goal

The design doc specifies a 30-second Redis reconnection grace window (design-doc §8.4), but the game page has zero UI for it. When an opponent's socket drops, the table looks frozen — no indicator, no countdown. When the viewer's own connection drops, there is also no warning. A bridge hand is unplayable with a silently missing seat.

After this ships: a banner appears naming the disconnected seat and counting down; if they reconnect within 30 s the banner clears silently; if grace expires a full-screen overlay routes remaining players back to the lobby. The viewer's own dropped socket shows a reconnecting spinner in the header.

## Branch

```bash
git checkout master && git pull
git checkout -b feat/reconnection-ui
```

---

## Current state (verified in code)

**`lib/socket/register-handlers.js`** — no disconnect events emitted to game rooms.

**`server/index.js`** — has a `socket.on('disconnect')` handler that only removes the socket from its room tracking. No Redis key is set, no event is broadcast to peers.

**`app/game/[gameId]/page.tsx`** — listens to `game:player_exited` (voluntary exit) but no involuntary disconnect events. No own-socket-dropped detection.

**`lib/features.ts`** — `reconnectGrace` flag is not yet defined (registered in this feature).

**Infrastructure note:** the 30-second Redis-backed grace is the full scalability implementation (design-doc §8.4). This feature ships the **UI layer** with an in-memory approximation: `setTimeout` in the server process. Redis-backed grace is deferred to the scalability work.

---

## Files to change (exact)

| # | File | Change |
|---|---|---|
| 1 | `lib/features.ts` | Add `reconnectGrace: on(process.env.NEXT_PUBLIC_FEATURE_RECONNECT_GRACE ?? process.env.FEATURE_RECONNECT_GRACE, false)`. |
| 2 | `.env.example` | Document `FEATURE_RECONNECT_GRACE` / `NEXT_PUBLIC_FEATURE_RECONNECT_GRACE`. |
| 3 | `server/index.js` | In `socket.on('disconnect')`: look up the user + room for this socket. If a game is active, `setTimeout(30_000, gracePeriodExpired)`. Emit `game:player_disconnected` to the room with `{ userId, seat, username, graceEndsAt: Date.now() + 30000 }`. Store the timeout handle keyed by `userId` so reconnect can cancel it. |
| 4 | `server/index.js` | In the `join-game` handler (reconnect path): if a timeout handle exists for this `userId`, `clearTimeout` it. Emit `game:player_reconnected` to the room with `{ userId, seat, username }`. |
| 5 | `server/index.js` | `gracePeriodExpired` callback: emit `game:disconnect_timeout` to the room with `{ userId, seat }`. (Lobby redirect is driven by clients on this event.) |
| 6 | `lib/socket/register-handlers.js` | Relay the three new server-originated events through the socket layer (they originate from `server/index.js`, not from client events — no relay needed; document this for clarity). |
| 7 | `components/game/DisconnectBanner.tsx` | **New.** Renders an amber banner for each entry in `disconnectedPlayers`. Shows seat, username, live countdown (`graceEndsAt - Date.now()`), updated every second via `setInterval`. Unmounts when `disconnectedPlayers` is empty. |
| 8 | `app/game/[gameId]/page.tsx` | Add `disconnectedPlayers` state: `Map<string, { seat: string; username: string; graceEndsAt: number }>`. Listen for `game:player_disconnected` → add to map. `game:player_reconnected` → remove from map. `game:disconnect_timeout` → remove from map + push to lobby with a message. Render `<DisconnectBanner>` when non-empty and `isEnabled("reconnectGrace")`. |
| 9 | `app/game/[gameId]/page.tsx` | Own-socket dropped: listen for socket `disconnect` event (the Socket.io client event) → show inline spinner in header. On socket `connect` → clear spinner. |

### Banner UI spec

```
┌──────────────────────────────────────────────────────────┐
│  ⚠  East (Alice) disconnected — reconnecting…   00:24   │
└──────────────────────────────────────────────────────────┘
```
- Amber background (`bg-yellow-900/40 border-yellow-500`), full width, above the turn indicator.
- Multiple disconnected players stack vertically.
- Countdown uses `Math.ceil((graceEndsAt - Date.now()) / 1000)` updated each second.
- When `game:disconnect_timeout` fires: replace banner with a red full-width overlay: "East left the game. Returning to lobby in 3 s…" then `router.push(/room/${roomId})`.

### Own-socket indicator

Small spinner + "Reconnecting…" text injected into the game header (right of the Exit button). Removed on `socket.on('connect')`. Does **not** block gameplay — the server holds the turn until reconnect or grace expiry.

---

## Tests (exact)

### 1. Unit — DisconnectBanner countdown

```ts
// __tests__/unit/DisconnectBanner.test.tsx
// vi.useFakeTimers. Render with graceEndsAt = Date.now() + 20_000.
// Assert initial display "00:20". Advance 5 s. Assert "00:15". Advance 20 s total. Assert component shows 0.
```

### 2. Unit — page state transitions

```ts
// Simulate socket event game:player_disconnected → assert disconnectedPlayers map has entry.
// Simulate game:player_reconnected → assert map empty.
// Simulate game:disconnect_timeout → assert router.push called with /room/:id.
```

### 3. Server — grace timeout fires

```ts
// __tests__/socket/reconnection.test.ts (new)
// Connect two sockets, join a game room. Disconnect one. Assert game:player_disconnected emitted to room.
// vi.useFakeTimers, advance 30 s. Assert game:disconnect_timeout emitted.
// Reconnect before timeout: assert game:player_reconnected emitted + timeout cancelled (disconnect_timeout NOT fired).
```

### Run before PR

```bash
npm run lint && npm run build
npm run test && npm run test:socket
# manual: open 4 browsers, kill one tab's network. Confirm banner + countdown in others.
# manual: restore network within 30 s — confirm banner clears.
# manual: let 30 s expire — confirm lobby redirect.
```

---

## Definition of done

- [ ] `reconnectGrace` flag registered in `lib/features.ts` and `.env.example`.
- [ ] Server emits `game:player_disconnected` on socket drop with `graceEndsAt` timestamp.
- [ ] Server emits `game:player_reconnected` on rejoin within grace window, cancelling the timeout.
- [ ] Server emits `game:disconnect_timeout` after 30 s with no reconnect.
- [ ] `<DisconnectBanner>` shows seat, name, and live countdown; stacks for multiple dropouts.
- [ ] On `disconnect_timeout`: remaining players see "X left the game" overlay + auto-redirect to lobby after 3 s.
- [ ] Own-socket drop shows reconnecting spinner in header; clears on reconnect.
- [ ] All paths gated on `isEnabled("reconnectGrace")` — off by default, no UI change when flag is off.
- [ ] Unit + socket tests green.
