# Module 01 — Architecture & Design

> Session 001 | Prerequisite: Module 00

---

## What Is a Design Document and Why Write One?

A **design document** (also called a technical spec or architecture doc) is a written description of a software system before you build it. It covers:

- What the system needs to do (requirements)
- How the system is structured (architecture)
- Why each structural decision was made (rationale)
- What can go wrong and how to prevent it (failure modes)

In this project the design document lives at `docs/design-document.md`. It started at 1,800 lines and was trimmed to 360 — the reduction was intentional. The original had full SQL DDL (table creation statements), every API request/response JSON body, bash deployment scripts, ASCII wireframes, and a "How to Play Bridge" manual. All of that is useful in a different context, but inside a design doc it creates noise that obscures the actual architectural decisions.

**The principle:** A design document's job is to answer the question "why is the system built this way?" — not to be a complete specification of every implementation detail. Implementation details belong in code. Decisions belong in the design doc.

---

## The Tech Stack — Every Tool Explained and Justified

Let's go through each technology, what it does, what alternatives exist, and why this one was chosen.

### Next.js 14 (with App Router)

**What it is:** A framework built on top of React that handles routing, server-side rendering, and API endpoints. React itself only handles the UI layer — Next.js adds everything around it.

**What "App Router" means:** In Next.js 14, there are two routing systems: the older "Pages Router" (`pages/` directory) and the newer "App Router" (`app/` directory). App Router supports a newer React feature called **Server Components** — components that execute entirely on the server and send only HTML to the browser, with no JavaScript bundle. This makes initial page loads faster.

**The file-system router:** In Next.js App Router, the folder structure IS the URL structure:

```
app/
  page.tsx                → GET /
  login/page.tsx          → GET /login
  room/[roomId]/page.tsx  → GET /room/:roomId  (any value for roomId)
  api/rooms/create/route.ts → POST /api/rooms/create
```

The `[roomId]` folder name creates a **dynamic segment** — a wildcard that captures whatever value is in that URL position. When a user visits `/room/abc123`, Next.js renders `room/[roomId]/page.tsx` and passes `{ roomId: 'abc123' }` as a prop.

Internally, this routing resolution is a **trie traversal** (prefix tree lookup). The framework takes the URL, splits it by `/`, and walks the file system tree matching segments. Dynamic segments like `[roomId]` are wildcard nodes that match anything.

**Alternatives considered:**
- *React + Express.js separately*: Two codebases, two deployments, CORS to configure. Higher maintenance.
- *Remix*: Similar to Next.js App Router, good routing, but smaller ecosystem and less production evidence.
- *SvelteKit*: Smaller bundle, simpler mental model, but the team's existing knowledge was in React/TypeScript.

**Why Next.js was chosen:** Single codebase for frontend and backend, mature ecosystem, TypeScript first-class, excellent Prisma and NextAuth compatibility.

---

### PostgreSQL

**What it is:** A relational database. Data is stored in tables with rows and columns. Tables reference each other via **foreign keys** — values in one table that point to rows in another.

**What "relational" means and why it matters:** Consider this data:

```
users table:
  id: "user-1"  email: "alice@example.com"

game_rooms table:
  id: "room-1"  creator_id: "user-1"  name: "Alice's Room"

game_players table:
  id: "player-1"  game_room_id: "room-1"  user_id: "user-1"  seat: "NORTH"
```

The `creator_id` column in `game_rooms` is a **foreign key** — it references `users.id`. If you try to insert a room with `creator_id: "user-that-does-not-exist"`, PostgreSQL **rejects the insert entirely**. You never have a room pointing to a ghost user.

This is **referential integrity** — the database guarantees that your relationships are always valid, at the storage layer, regardless of what your application code does. If your application has a bug that tries to create invalid relationships, the database catches it.

**What "ACID transactions" means:** ACID stands for Atomicity, Consistency, Isolation, Durability. For games:
- *Atomicity*: Writing a game move involves updating the game state AND inserting a move record. With transactions, both operations succeed or both are rolled back — you never have a move recorded but the state not updated.
- *Isolation*: While you're writing, another concurrent read sees either the old state entirely or the new state entirely — never a partial half-written state.

**Alternatives considered:**
- *MongoDB*: Document-oriented, schema-flexible. But for a game with strict relationships (move belongs to game belongs to room belongs to user), the enforced schema of PostgreSQL catches more bugs. MongoDB silently accepts invalid data; PostgreSQL rejects it.
- *SQLite*: Great for development, but single-writer (no concurrent writes from multiple servers). Rules it out for production multi-server deployments.
- *PlanetScale (MySQL)*: No foreign key enforcement by default. Loses referential integrity guarantees.

**Why PostgreSQL was chosen:** Battle-tested, full ACID guarantees, foreign key enforcement, JSONB columns for flexible data, excellent Prisma support.

---

### Redis

**What it is:** An in-memory key-value store. Data lives in RAM, not on disk. Lookups are O(1) and happen in microseconds instead of milliseconds.

**Why it's needed alongside PostgreSQL:**

Reading game state from PostgreSQL requires a disk seek — physically locating data on a spinning disk or SSD. This takes 5–20 milliseconds. For a card game where events happen multiple times per second:

- Player A plays a card → server reads current state → validates → updates → broadcasts
- This sequence happens ~50 times per game
- At 20ms per PostgreSQL read: 50 × 20ms = 1 second of database wait time per game

With Redis:
- Same reads from RAM: 50 × 0.5ms = 25ms total

Redis is not a replacement for PostgreSQL — it has no durability by default (data disappears on server restart unless configured otherwise). The pattern used here is:

```
Write path: write to Redis first (fast, live state) + write to PostgreSQL (slow, permanent record)
Read path: read from Redis (fast, live state)
Recovery path: if Redis is empty, replay PostgreSQL records to reconstruct state
```

Redis also powers:
- **Session tokens**: Every HTTP request checks "is this user logged in?" — that lookup must be sub-millisecond to not slow down every page load.
- **Socket.io pub/sub**: With multiple servers, Redis is the message bus that lets Server 1 broadcast to sockets connected to Server 2 (Issue #13).
- **Reconnection tokens**: When a player disconnects, a 30-second Redis key tracks their seat until they reconnect (Issue #16).

**Alternatives considered:**
- *Memcached*: Simpler than Redis, but no pub/sub, no sorted sets, no TTL-based key expiry. Not suitable for the full use case.
- *Just PostgreSQL for everything*: Works at small scale, too slow for high-frequency game state reads.

---

### Socket.io

**What it is:** A library for real-time bidirectional communication between server and clients. It is built on top of WebSockets with several important additions.

**What "bidirectional" means:** Standard HTTP is one-directional: the client asks, the server answers. The server cannot send data to the client without being asked first.

WebSockets open a persistent, bidirectional channel: either side can send a message at any time. When Player A plays a card, the server immediately pushes the update to Players B, C, D — without them polling or requesting anything.

**What Socket.io adds on top of raw WebSockets:**

1. **Named events**: Instead of sending raw strings and parsing them on the other side, Socket.io lets you emit events by name:
   ```javascript
   socket.emit('game:bid_made', { bid: { level: 2, suit: 'NT' }, playerId: 'abc' });
   socket.on('game:bid_made', (data) => { /* data is typed */ });
   ```

2. **Rooms**: A "room" in Socket.io is a named group of sockets. When all 4 players join `room:abc`, broadcasting to that room ID sends to all 4 simultaneously:
   ```javascript
   io.to('room-abc').emit('game:card_played', cardData);
   // All 4 sockets in 'room-abc' receive this message
   ```
   Internally, a room is a **hash set** of socket IDs. Join/leave are O(1), broadcast is O(N) where N = room size.

3. **Automatic reconnection**: If a WebSocket connection drops (phone goes to sleep, brief WiFi loss), Socket.io automatically retries the connection with exponential backoff — doubling the wait time between attempts to avoid overwhelming the server.

4. **Fallback transport**: Some corporate firewalls block WebSocket connections. Socket.io falls back to HTTP long-polling in that case — the client repeatedly sends HTTP requests asking "anything new?", which is less efficient but still works.

**Why not raw WebSockets (`ws` library)?** You would rebuild rooms, event naming, reconnection, and fallback transport yourself. That is weeks of work that Socket.io already provides, tested against millions of production deployments.

**Alternatives considered:**
- *Server-Sent Events (SSE)*: Server-to-client only, no client-to-server push. Doesn't work for game events.
- *Firebase Realtime Database*: Hosted service, real-time sync built-in. But costs more, less control, harder to run custom game logic.
- *Ably / Pusher*: Managed WebSocket services. Less control, ongoing per-message cost.

---

### WebRTC

**What it is:** A browser API that lets two browsers communicate directly with each other (peer-to-peer) — audio, video, or raw data — without routing through a server.

**Why peer-to-peer for voice:** If voice audio routed through your server, you pay for every byte of audio in both directions. With 4 players, each sending voice to 3 others, at a typical audio bitrate of 32kbps, a 1-hour game generates:

```
4 players × 3 connections × 32kbps × 3600 seconds = ~1.38 GB of audio relay
```

At typical VPS bandwidth costs, that's non-trivial per game. Peer-to-peer eliminates this entirely — the server handles only the initial 2-second handshake.

**The topology:** 4 players in a full mesh means C(4,2) = 6 connections. Each player maintains 3 RTCPeerConnections simultaneously. This is O(N²) in the number of players, which is why this approach doesn't scale past ~8-10 people — at 16 players you'd need 120 connections per player.

**Why Socket.io handles signaling:** WebRTC connections can't start until the two peers exchange SDP (Session Description Protocol — a description of each side's codec capabilities, network info, and connection parameters) and ICE candidates (lists of network addresses where each peer can be reached). The two peers need a communication channel to exchange this information before they're connected. Socket.io is that initial channel.

**Alternatives considered:**
- *Mediasoup / SFU (Selective Forwarding Unit)*: A server that receives one audio stream from each participant and forwards it to all others. Reduces client connections from N-1 to 1 inbound + 1 outbound. Better for >6 players. Higher server cost and complexity. Overkill for 4 players.
- *Agora / Twilio Video*: Managed WebRTC services. Less control, per-minute cost.

---

### NextAuth.js v5

**What it is:** An authentication library for Next.js. It handles the full login flow: session creation, cookie management, OAuth providers, JWT validation.

**What authentication means here:** When a user logs in, NextAuth creates a **session token** — a signed string stored in a cookie. On every subsequent request, the browser sends this cookie, and NextAuth verifies the signature to confirm the user's identity. The session data (who is logged in, their ID) is stored in Redis for fast lookup.

**Why NextAuth instead of writing authentication yourself:** Authentication is notoriously easy to get wrong — timing attacks on password comparison, insecure session token storage, improper cookie security flags, missing CSRF protection. NextAuth handles all of these correctly by default.

---

## The State Machine: Modelling the Game Lifecycle

A **finite state machine (FSM)** is a mathematical model of a system that can be in exactly one of a finite number of states at any given time, and transitions between states in response to events.

For BridgeOnline's game lifecycle:

```
States (nodes):
  RoomWaiting, RoomReady, Initializing, Bidding, Playing, Scoring, Completed

Transitions (directed edges):
  RoomWaiting  --[all 4 players joined]--> RoomReady
  RoomReady    --[all 4 players mark ready]--> Initializing
  Initializing --[cards dealt, dealer set]--> Bidding        (automatic, no player action)
  Bidding      --[bid/pass/double/redouble]--> Bidding        (self-loop: stays in Bidding)
  Bidding      --[3 consecutive passes]--> Playing
  Playing      --[card played]--> Playing                     (self-loop)
  Playing      --[13 tricks completed]--> Scoring
  Scoring      --[score calculated, more boards remain]--> Initializing
  Scoring      --[score calculated, all boards done]--> Completed
```

This is a directed graph. Using it in code means every action goes through a check: "is this transition valid from the current state?" If not, reject the action.

```typescript
function processEvent(currentState: GameState, action: GameAction): GameState | Error {
    switch (currentState.phase) {
        case 'BIDDING':
            if (action.type !== 'bid' && action.type !== 'pass' ...) {
                return new Error('Invalid action for BIDDING phase');
            }
            // process bid...
        case 'PLAYING':
            if (action.type !== 'play_card') {
                return new Error('Invalid action for PLAYING phase');
            }
            // process card play...
    }
}
```

**Why this matters for security:** Without a state machine, a bug or a malicious user could send a "play_card" event during the bidding phase, or a "bid" event during card play. The state machine is the guard that rejects out-of-sequence actions.

**DSA connection:** The FSM is a directed graph with 7 nodes and ~10 edges. The transition function is essentially a lookup in this graph: given current node and input, find the valid outgoing edge (or reject if none exists).

---

## The Design Document Lifecycle: 1,800 → 360 Lines

The design document was written first at ~1,800 lines, then trimmed to 360. What was removed and why:

| Removed | Why |
|---|---|
| Full SQL DDL (`CREATE TABLE` statements) | The Prisma schema is the authoritative source; having both creates sync problems |
| Every API request/response JSON body | This level of detail belongs in API documentation or code comments, not an architecture doc |
| Bash deployment scripts | These belong in `scripts/` or CI config, not a design doc |
| Nginx configuration | Infrastructure config, not architecture |
| ASCII wireframes | Belongs in Figma or a UI mockup tool |
| "How to Play Bridge" manual | Domain knowledge reference, should be a separate document |

**The principle behind this trim:** A design document that is too detailed becomes a maintenance burden. Every time code changes, the doc needs updating. If you forget to update it, the doc lies — and a lying doc is worse than no doc, because future developers trust it and get misled.

The goal is: keep decisions and rationale (doesn't change as implementation evolves), remove implementation details (changes constantly).

---

## The 8 Scalability Gaps — Identified Before Writing Code

One of the most valuable parts of the design process was reading the architecture and asking "where will this break?" before writing a line of code. This produced 8 GitHub issues:

### #13 — Redis Adapter (P0)
**Problem**: One Node.js process with Socket.io works for one server. Add a second server and broadcasts on Server 1 don't reach sockets on Server 2.
**Why it's P0**: Without this, horizontal scaling is impossible. You can never add a second server.

### #14 — Hot/Cold State Split (P0)
**Problem**: Game state in PostgreSQL only means every game event (bid, card play) requires a disk-speed database write/read.
**Why it's P0**: At high event rates, this creates measurable latency during gameplay.

### #15 — BullMQ Job Queue (P1)
**Problem**: A server crash between "write to DB" and "broadcast to clients" leaves the game in an inconsistent state.
**Why it's P1**: Not a launch blocker but will cause occasional game corruption under real load.

### #16 — Reconnection Protocol (P1)
**Problem**: A player refreshing their browser = permanent seat loss. Their 2-second browser reload breaks the game for 3 others.
**Why it's P1**: Makes the game unusable for players on mobile or unstable connections.

### #17 — Service Separation (P2)
**Problem**: CPU-heavy game processing (dealing cards, computing scores) shares the Node.js event loop with HTTP requests and WebSocket handling. A slow game operation blocks all connections.
**Why it's P2**: Only matters under concurrent game load.

### #18 — Short-Lived TURN Credentials (P2)
**Problem**: Static TURN server credentials in `.env` can be extracted from client-side JavaScript and abused to relay non-game traffic through your TURN server.
**Why it's P2**: Security issue, but exploitable only by users who inspect network traffic.

### #19 — Missing Indexes (P2)
**Problem**: Common queries (find room by invite code, find players in room) do full table scans without indexes.
**Why it's P2**: Only matters with thousands of rooms/players.

### #20 — Observability Stack (P3)
**Problem**: No logging, metrics, or error tracking means debugging production issues is guesswork.
**Why it's P3**: Not required for functionality, but critical for operating the service long-term.

---

## Key Mental Models for This Project

**1. The data flows in two directions at different speeds:**
- Client → Server → Database: actions and persistence (slower)
- Server → All Clients: state updates (fast, via WebSocket broadcast)

**2. Security boundaries matter more than convenience:**
- The server is trusted. The client is not.
- Never send a player data they shouldn't see (other players' cards).
- Validate every action on the server even if the client already validated it.

**3. Pure logic is separated from side effects:**
- `lib/game/` — no I/O, no randomness, no side effects. Pure functions.
- `server/index.js` — I/O, state, side effects. Socket handlers.
- This separation lets you test game logic without spinning up a server or database.

**4. Design documents prevent expensive mistakes:**
- Identifying the 8 scalability issues before coding saved weeks of rework.
- Designing the database schema upfront prevented half a dozen schema migration bugs.

---

**Next:** [Module 02 — Game Logic as Pure Functions](./02-game-logic-pure-functions.md)
