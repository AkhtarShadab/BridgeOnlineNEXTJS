# Module 04 — Real-Time with Socket.io

> Session 003 | Prerequisite: Module 01

---

## Why HTTP Is the Wrong Tool for a Game

HTTP is the foundational protocol of the web. Every time you visit a webpage or call an API, HTTP handles the request. But HTTP has a fundamental constraint that makes it unsuitable for real-time multiplayer games:

**HTTP is strictly request-response.** The client sends a request. The server sends a response. The connection closes. The server can never initiate communication — it can only respond.

For a multiplayer game:
- Player A plays a card
- The server updates the game state
- Players B, C, D need to know about this card immediately

With HTTP, B, C, and D have no way to know about the card until they send a request. Options:

**Option 1: Polling**
```
Every 500ms:  GET /api/games/:id/state
              → server returns current state
              → client checks if anything changed
```
Problems: 500ms of latency (card appears half a second late), 4 players × 2 requests/second = 8 requests/second of wasted traffic even when nothing is happening, server hammered with redundant requests.

**Option 2: Long Polling**
```
Client sends: GET /api/games/:id/wait
Server holds the connection open until something changes, then responds
Client immediately sends another GET /wait
```
Better latency than polling, but still request-response model. Each "wait" connection uses server resources. Hard to manage timeouts and reconnections.

**Option 3: WebSockets (what this project uses)**
```
Client establishes a WebSocket connection — one persistent bidirectional channel
Server pushes events whenever they happen — no request needed
```
WebSockets are full-duplex: both sides can send messages at any time. One persistent connection per player. The server pushes the card event immediately when it happens. Players see it in under 50ms on a good network.

---

## WebSockets: The Protocol Under the Hood

A WebSocket connection starts as an HTTP request — a special one called the **handshake**:

```
Client → Server:
  GET /socket HTTP/1.1
  Upgrade: websocket
  Connection: Upgrade
  Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==

Server → Client:
  HTTP/1.1 101 Switching Protocols
  Upgrade: websocket
  Connection: Upgrade
  Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

The `101 Switching Protocols` response means: "I'm upgrading this connection from HTTP to WebSocket." After this, the TCP connection stays open and both sides exchange **frames** (binary or text data) in any order, at any time.

**Why does the handshake use HTTP?** It lets WebSockets work through existing infrastructure (load balancers, proxies, firewalls) that already understand HTTP. The upgrade is a standard HTTP mechanism.

---

## Socket.io: What It Adds on Top of WebSockets

Socket.io is not just a WebSocket wrapper — it's a significant abstraction layer:

### 1. Named Events

Raw WebSockets send bytes. You have to parse every message to determine what it means:
```javascript
// Raw WebSocket — you parse everything yourself
ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'bid_made') handleBid(msg);
    else if (msg.type === 'card_played') handleCard(msg);
    // ... 20 more cases
};
```

Socket.io lets you register handlers by event name:
```javascript
// Socket.io — register by event name
socket.on('game:bid_made', (data) => handleBid(data));
socket.on('game:card_played', (data) => handleCard(data));
```

This is the **Observer pattern** — a component registers interest in specific events and is notified when they fire. The event name is the observable; handlers are the observers.

### 2. Rooms — Named Broadcast Groups

A **room** in Socket.io is a named group of sockets. You can broadcast a message to everyone in a room with one call.

```javascript
// socket.join() adds this connection to the group
socket.join('game-room-abc');

// io.to() broadcasts to everyone in the group
io.to('game-room-abc').emit('game:card_played', cardData);
// All 4 players connected to 'game-room-abc' receive this message simultaneously
```

Internally, a room is a **hash set** of socket IDs. `socket.join(roomId)` does `rooms[roomId].add(socket.id)`. Broadcasting iterates the set and sends to each socket. Join/leave are O(1); broadcast is O(N) where N = room size. For a 4-player game, N=4 — constant time in practice.

**`socket.to(room)` vs `io.to(room)` — a critical difference:**
- `socket.to(room).emit(...)` — sends to all in room **except the socket that called it**
- `io.to(room).emit(...)` — sends to **all** in room including the caller

```javascript
socket.on('room:join', ({ roomId }) => {
    socket.join(roomId);
    // Notify OTHER players a new player joined — NOT the joining player themselves
    socket.to(roomId).emit('room:player_joined', { socketId: socket.id });
    // ↑ correct: the joining player doesn't need to be told they joined
});

socket.on('game:bid_made', ({ bid }) => {
    // Notify ALL 4 players about the bid, including the bidder
    io.to(roomId).emit('game:bid_made', { bid, playerId });
    // ↑ correct: the bidder's screen also needs to update
});
```

### 3. Automatic Reconnection with Exponential Backoff

When a WebSocket drops (network blip, phone sleep, router restart), Socket.io automatically tries to reconnect. It uses **exponential backoff** — doubling the wait time between attempts:

```
Attempt 1: wait 500ms
Attempt 2: wait 1000ms
Attempt 3: wait 2000ms
Attempt 4: wait 4000ms
...up to a maximum delay
```

Why exponential backoff? If the server is overwhelmed and dropping connections, having all clients retry immediately at fixed intervals creates a **thundering herd** — everyone reconnecting simultaneously at the exact moment the server recovers, potentially overwhelming it again. Exponential backoff spreads reconnection attempts out over time.

### 4. Transport Fallback

Some corporate firewalls and load balancers block WebSocket connections (they proxy only HTTP). Socket.io automatically falls back to **HTTP long-polling** when WebSockets are unavailable. Long-polling is less efficient but keeps the application working in restricted environments.

**Why this matters:** If you deployed with raw WebSockets and 5% of your users are on corporate networks that block WebSockets, those 5% get a broken experience. Socket.io's fallback makes the application work for everyone.

---

## The Handler Extraction Decision

All Socket.io event handlers live in the server file. In the original design, they were all inline in `server/index.js`. A key refactoring was extracting them into a separate function:

**Before:**
```javascript
// server/index.js
io.on('connection', (socket) => {
    socket.on('room:join', ({ roomId }) => { ... });
    socket.on('room:leave', ({ roomId }) => { ... });
    socket.on('game:make_bid', ({ bid }) => { ... });
    // ... 15 more handlers, all inline
});
```

**After:**
```javascript
// lib/socket/register-handlers.js
export function registerHandlers(io, socket) {
    socket.on('room:join', ({ roomId }) => { ... });
    // ... all handlers
}

// server/index.js
import { registerHandlers } from '../lib/socket/register-handlers.js';
io.on('connection', (socket) => {
    registerHandlers(io, socket);
});
```

**Why extract?** To make the handlers testable without running a real HTTP server. The test helper creates a Socket.io server in-process and calls `registerHandlers` on it:

```typescript
// __tests__/helpers/socket-server.ts

export async function createTestServer(): Promise<TestSocketServer> {
    const httpServer = createServer();
    const io = new Server(httpServer);
    registerHandlers(io);  // ← same function used in production
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    return { io, httpServer, url: `http://localhost:${port}` };
}
```

`port 0` is a standard Unix/POSIX convention: asking the OS to assign any available port. This prevents test port conflicts when multiple test files run (even sequentially — a port might not be fully released before the next test starts). The OS guarantees `port 0` assignments don't collide.

---

## The Full Event Lifecycle: Bid Made

Tracing what happens when Player A makes a bid:

```
Player A browser:
  User clicks "Bid 2NT" button
  → React onClick fires
  → socket.emit('game:make_bid', { gameId: 'abc', bid: { level: 2, suit: 'NT' }, playerId: 'alice' })

Server receives 'game:make_bid':
  1. Check: is it Alice's turn?
     → If no: socket.emit('error', { message: 'Not your turn' }) → stop
  2. Validate the bid:
     → validateBidAction(action, bidHistory, currentPlayer, lastBidTeam)
     → If invalid: socket.emit('error', { message: 'Bid must be higher' }) → stop
  3. Update game state:
     → Write to Redis: HSET game:abc:state currentBid { level: 2, suit: 'NT' }
     → Write to PostgreSQL: INSERT INTO game_moves (game_id, player_id, move_type, ...)
  4. Check: is the auction over (3 consecutive passes)?
     → isBiddingComplete([...bidHistory, action])
  5. Broadcast to all 4 players:
     → io.to('abc').emit('game:bid_made', {
           bid: { level: 2, suit: 'NT' },
           playerId: 'alice',
           seat: 'NORTH',
           nextPlayer: 'EAST'
       })

All four browsers receive 'game:bid_made':
  → Each browser's Socket.io client fires the 'game:bid_made' handler
  → React state updates (bid appears in the auction box)
  → Component re-renders — all 4 screens show "2NT by North"
```

**Key observation:** The game logic functions from `lib/game/bidding.ts` are called inside the Socket.io handler. This is the integration point between pure functions and I/O — the handler orchestrates the I/O (read state, write state, broadcast), while the pure functions do the computation (validate bid, check auction end). Neither part can do the other's job well.

---

## Hand Filtering: The Most Important Security Concern

In Bridge, each player holds 13 cards that no other player can see. When the server sends game state to a client, it must only include that client's hand:

```javascript
socket.on('game:join', ({ gameId, seat }) => {
    const fullState = getGameState(gameId);  // all 4 hands

    // Send ONLY this player's hand — filter out all others
    socket.emit('game:state', {
        ...fullState,
        hands: {
            [seat]: fullState.hands[seat]  // e.g., only NORTH's cards
        }
    });
});
```

**Why this must happen on the server and not the client:**

Option A (wrong): Send all 4 hands to the client, have the client display only its own.
```javascript
// Client receives all 4 hands but only renders theirs
// A malicious user opens DevTools, looks at the network tab,
// sees all 4 hands in the WebSocket message
// → Instant ability to see all opponent cards
```

Option B (correct): Server filters before sending.
```javascript
// Client only ever receives its own hand
// No amount of browser DevTools inspection reveals other hands
// The data simply was never sent to that client
```

The principle: **the server is the trust boundary**. The server is the only entity that legitimately needs to know all hands (to validate plays). Clients only need their own hand. The server enforces this.

This applies to more than cards:
- Disconnected players: other players should not receive a disconnected player's reconnect token
- Spectators (future feature): spectators could see all hands only with explicit permission
- Admin tools: a separate, authenticated endpoint could show all hands for debugging

---

## The `waitForEvent` Pattern in Tests

Socket.io events are asynchronous — you emit an event and the response arrives at an unknown future time. Testing this requires converting the event-based pattern into the Promise-based pattern that `async/await` works with.

```typescript
// __tests__/helpers/socket-server.ts

export function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
        // If the event doesn't arrive within timeoutMs, fail the test
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout: event '${event}' did not arrive within ${timeoutMs}ms`));
        }, timeoutMs);

        // Resolve the promise when the event arrives
        socket.once(event, (data: T) => {
            clearTimeout(timeout);  // cancel the timeout
            resolve(data);
        });
    });
}
```

**Why `socket.once` instead of `socket.on`?**

`socket.on` registers a persistent handler — it fires every time the event arrives. `socket.once` registers a one-time handler — it fires once and then automatically removes itself. In tests, you usually want to wait for exactly one occurrence of an event. Using `socket.on` would leave lingering handlers that fire in subsequent tests.

**The subscribe-before-trigger pattern:**

```typescript
// WRONG: race condition — event might arrive before listener is registered
alice.emit('room:join', { roomId: 'test' });
const event = await waitForEvent(bob, 'room:player_joined');  // might miss it!

// CORRECT: register listener first, then trigger the action
const eventPromise = waitForEvent(bob, 'room:player_joined');  // register first
alice.emit('room:join', { roomId: 'test' });                   // trigger second
const event = await eventPromise;                               // now wait
```

This ordering matters because Socket.io events are delivered asynchronously. If `alice.emit` causes the server to immediately emit back to bob, and bob's listener isn't registered yet, the event is missed. The pattern: always set up your listeners before triggering the action that will produce those events.

**DSA connection:** This is the **producer-consumer** problem on a promise-based queue. The producer (server) emits an event. The consumer (test) waits to receive it. The `waitForEvent` promise serves as the synchronisation mechanism — it blocks the test until the event is produced.

---

## Disconnect Handling and the Grace Period Problem

```javascript
socket.on('disconnect', (reason) => {
    // reason can be: 'transport close', 'ping timeout', 'transport error', etc.
    for (const room of socket.rooms) {
        socket.to(room).emit('room:player_left', { socketId: socket.id });
    }
    // TODO: Issue #16 — start 30s grace period before freeing seat
});
```

The current implementation immediately notifies everyone that the player left. This is wrong for the reconnection case: a browser refresh takes 2–3 seconds. The player's socket disconnects during the refresh and reconnects when the new page loads. With the current code, all 3 other players see "Alice left" for 3 seconds, then "Alice joined." The game is interrupted.

Issue #16 proposes a 30-second grace period: when a player disconnects, hold their seat for 30 seconds. If they reconnect within that window, restore their seat seamlessly. If they don't reconnect, then free the seat and notify others.

The implementation pattern (see Module 07 for details):
```javascript
socket.on('disconnect', async () => {
    const seat = getPlayerSeat(socket.id);
    // Store reconnect info in Redis with 30-second TTL
    await redis.set(`reconnect:${playerId}`, seat, { EX: 30 });
    // Notify others with a "temporarily disconnected" status, not "left"
    io.to(roomId).emit('room:player_disconnected', { playerId, timeout: 30 });
});
```

---

## Event Naming Convention

Looking at the event table:

```
room:join          room:player_joined
room:leave         room:player_left
room:select_seat   room:seat_selected
game:make_bid      game:bid_made
game:play_card     game:card_played
voice:offer        voice:offer (relayed)
```

The convention: `namespace:verb_noun` for client-to-server, `namespace:noun_verbed` for server-to-client. The namespace (`room`, `game`, `voice`) groups related events. This is not enforced by Socket.io — it's a team convention that makes the event list readable and avoids naming collisions.

**Alternative conventions:**
- `ROOM_JOIN`, `ROOM_PLAYER_JOINED` — all caps, underscores (Redux style)
- `joinRoom`, `playerJoined` — camelCase (traditional event name style)

The colon namespace approach is idiomatic in Socket.io-heavy codebases. It makes scanning the event list faster: all `game:` events are related to game logic, all `voice:` events are related to voice chat.

---

## Summary: Socket.io Concepts

| Concept | What It Means | Why It's Needed |
|---|---|---|
| WebSocket | Persistent bidirectional TCP connection | Server can push events without client polling |
| Socket.io | WebSocket wrapper with named events, rooms, reconnect | Ease of use, reliability, broadcast |
| Room | Named hash set of socket IDs | Broadcast to all 4 players in one call |
| `socket.to(room)` | Broadcast excluding sender | Join notifications, seat selection |
| `io.to(room)` | Broadcast including sender | Game events all players need to see |
| Named events | `socket.on('event', handler)` | Observer pattern, clean handler registration |
| `waitForEvent` | Promise wrapping `socket.once` | Async testing of event-based code |
| Hand filtering | Server sends only this player's cards | Security — client must not see opponent cards |
| Exponential backoff | Reconnect delay doubles each attempt | Avoid thundering herd on server recovery |
| Port 0 | OS-assigned random port | Prevent test port conflicts |

---

**Next:** [Module 05 — Testing Strategy (5 Layers)](./05-testing-strategy.md)
