# Module 07 — Scalability Gaps & Fixes

> Session 001 | Prerequisite: Modules 01–04

---

## Why Scalability Matters (and When It Doesn't)

A common mistake is premature optimization — adding complexity for scale before you have users. But a worse mistake is ignoring known failure modes that will bite you the moment you deploy.

The 8 issues in this module fall into two categories:
1. **Will break at any scale** (P0, P1) — these are correctness or reliability issues dressed as scale issues
2. **Will break only under load** (P2, P3) — these are genuine scaling concerns

The priority labels reflect this:
- **P0** — must fix before launch
- **P1** — must fix before public use
- **P2** — can defer until you have users
- **P3** — operational nice-to-have

---

## Issue #13 — Redis Adapter for Socket.io (P0)

### The Problem

Socket.io "rooms" work fine when there's one server. But what happens when you run two servers?

```
Server 1                  Server 2
├── Alice (room: abc)     ├── Bob (room: abc)
└── Carol (room: xyz)     └── Dave (room: abc)

When Alice plays a card:
  io.to('abc').emit('card_played', ...)
  → reaches Bob ✓ (on Server 1)
  → does NOT reach Bob and Dave on Server 2 ✗
```

The `io.to(room)` broadcast only knows about sockets connected to **that server**. It has no way to reach sockets on other servers.

### The Fix — Redis Pub/Sub

```
Server 1 ──▶ Redis Channel "room:abc" ◀── Server 2
                      ↓
                Both servers subscribe to Redis
                Both forward the broadcast to their local sockets
```

The Redis adapter intercepts `io.to(room).emit(...)` and publishes it to a Redis channel. All servers subscribe to all channels and forward messages to their local sockets.

```javascript
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

**DSA connection:** This is the **pub/sub pattern** (Publish-Subscribe). Redis acts as a message broker. Publishers (servers that emit events) and subscribers (servers that need to receive them) are decoupled — they don't know about each other, only about the channel.

---

## Issue #14 — Hot/Cold Game State Split (P0)

### The Problem

Currently, `games.game_state` is a JSONB column in PostgreSQL. Every card play triggers a write to disk. With 4 players playing 13 tricks × 13 cards = 52 writes per game, and PostgreSQL is slower than needed for this write pattern.

Also, when the server needs to validate a bid ("is it this player's turn?"), it reads from PostgreSQL on every event. This adds 5-20ms of DB latency to every action.

### The Fix — Redis for Hot State

```
Player plays a card:
  → Write to Redis (in-memory, ~0.1ms)   ← "hot" path
  → Write to PostgreSQL (on disk, ~5ms)  ← "cold" path (durable record)

Player reconnects:
  → Read from Redis                      ← most common case
  → Fall back to PostgreSQL if Redis TTL expired
```

Redis stores the current game snapshot keyed by game ID:
```
redis.set(`game:${gameId}:state`, JSON.stringify(gameState), { EX: 3600 }); // 1hr TTL
```

PostgreSQL stores every move in `game_moves` with a `sequence_number` — the full audit trail. If Redis is cold (server restart, TTL expiry), you can reconstruct the current state by replaying all moves from PostgreSQL.

**DSA connection:** This is the **event sourcing** pattern:
- `game_moves` table = the **event log** (immutable, append-only)
- Redis `game_state` = the **materialized view** (derived from the log, fast to read)
- Replaying events from the log reconstructs the materialized view at any point in time

---

## Issue #15 — BullMQ Queue for Durable Game Actions (P1)

### The Problem

```
Player → Socket.io handler → update DB → broadcast event
```

If the server crashes between "update DB" and "broadcast event", the DB has the new state but no one was notified. The game is in an inconsistent state.

### The Fix — Job Queue

```
Player → Socket.io handler → enqueue job → acknowledge
                                    ↓
                              Worker picks up job
                                    ↓
                            update DB + broadcast
```

BullMQ stores jobs in Redis. If the worker crashes, the job stays in the queue and is retried when the worker restarts. Jobs are only removed from the queue after they complete successfully.

```typescript
// Enqueue
const queue = new Queue('game-actions', { connection: redis });
await queue.add('process-bid', { gameId, playerId, bid });

// Worker
const worker = new Worker('game-actions', async (job) => {
    const { gameId, playerId, bid } = job.data;
    await validateAndPersistBid(gameId, playerId, bid);
    io.to(gameId).emit('game:bid_made', { bid, playerId });
}, { connection: redis });
```

**DSA connection:** A job queue is a persistent **FIFO queue** with retry semantics. BullMQ's internal data structure uses Redis sorted sets — jobs are stored with a priority/score, and workers pop the highest-priority job. Retried jobs get a delay and are re-inserted with a future score.

---

## Issue #16 — Player Reconnection Protocol (P1)

### The Problem

A player refreshes their browser. Their WebSocket disconnects. Currently, the server treats this as a permanent leave — seat is freed, other players are notified. By the time the page reloads (~2 seconds), the game has broken.

### The Fix — Grace Period

```
Player disconnects:
  → Set a 30-second timer in Redis: SET reconnect:${playerId} "seat:NORTH" EX 30
  → Notify room: "player is temporarily disconnected, waiting..."
  → Do NOT free the seat yet

Player reconnects within 30s:
  → Check Redis: GET reconnect:${playerId}
  → Restore their seat and session
  → Notify room: "player has reconnected"

Timer expires without reconnect:
  → Free the seat
  → Notify room: "player has permanently left"
```

```javascript
socket.on('disconnect', async () => {
    const seat = getPlayerSeat(socket.id);
    await redis.set(`reconnect:${playerId}`, seat, { EX: 30 });
    io.to(roomId).emit('room:player_disconnected', { playerId, timeout: 30 });

    setTimeout(async () => {
        const stillPending = await redis.get(`reconnect:${playerId}`);
        if (stillPending) {
            // Timer expired without reconnect — free the seat
            await redis.del(`reconnect:${playerId}`);
            io.to(roomId).emit('room:player_left', { playerId });
        }
    }, 30_000);
});

socket.on('reconnect_attempt', async ({ playerId }) => {
    const savedSeat = await redis.get(`reconnect:${playerId}`);
    if (savedSeat) {
        await redis.del(`reconnect:${playerId}`);
        // Restore session
        io.to(roomId).emit('room:player_reconnected', { playerId });
    }
});
```

**DSA connection:** The `setTimeout` + Redis key with TTL implements a **distributed timer**. The Redis TTL is the authoritative timer (it survives server restarts). The `setTimeout` is a local approximation. In a production system with multiple servers, you'd use a more robust approach (scheduled BullMQ job).

---

## Issue #17 — Service Separation (P2)

### The Problem

Currently one Node.js process handles:
1. HTTP requests (Next.js pages + API routes)
2. WebSocket events (Socket.io game logic)
3. Game state processing (CPU-heavy scoring, deck dealing)

If a CPU-intensive game operation (dealing 52 cards, computing scores) blocks the event loop, Socket.io stops processing events — other players experience lag.

### The Fix — Separate Services

```
Nginx
  ├──▶ Next.js server (port 3000) — HTTP only
  ├──▶ Socket.io server (port 3001) — WebSocket only
  └──▶ Game Worker (port 3002) — CPU-heavy processing
```

Each service scales independently:
- High traffic: scale out Next.js instances
- Many concurrent games: scale out Socket.io instances (with Redis adapter from #13)
- CPU spikes: scale out game worker

**DSA connection:** This is the **divide and conquer** principle applied to system design. By splitting concerns into independent services, you can independently analyze and optimize each one.

---

## Issue #19 — Missing PostgreSQL Indexes (P2)

### The Problem

The most common query patterns have no indexes:
```sql
-- Find room by invite code (used on every join attempt)
SELECT * FROM game_rooms WHERE invite_code = 'ABC123';

-- Find active players in a room (used on every socket event)
SELECT * FROM game_players WHERE game_room_id = '...' AND is_ready = true;

-- Get moves in order (used every trick)
SELECT * FROM game_moves WHERE game_id = '...' ORDER BY sequence_number;
```

Without indexes, each query is a **full table scan** — O(N) where N = total rows. With indexes, it's O(log N).

### The Fix

```sql
CREATE INDEX ON game_rooms(invite_code);         -- already exists (@@unique)
CREATE INDEX ON game_players(game_room_id);      -- already exists (@@index)
CREATE INDEX ON game_moves(game_id, sequence_number);  -- missing
CREATE INDEX ON games(game_room_id);             -- missing
```

**DSA connection:** Database indexes are **B+ trees**. A B+ tree with order M supports:
- Point lookup: O(log_M N)
- Range scan: O(log_M N + K) where K = matching rows
- Insert/update: O(log_M N)

The trade-off: indexes make reads faster but writes slower (the index must also be updated). Add indexes only on columns you actually query by.

---

## Issue #20 — Observability Stack (P3)

Without observability, production debugging is guesswork. The three pillars:

### Logs (Pino)
```typescript
const log = pino({ level: 'info' });

log.info({ gameId, playerId, bid }, 'bid made');
log.error({ gameId, err }, 'failed to process bid');
```

Structured JSON logs (not `console.log` strings) can be queried, filtered, and aggregated.

### Metrics (Prometheus + Grafana)
```
active_games_total{status="in_progress"} 42
bid_processing_duration_seconds{p99} 0.023
socket_connections_total 180
```

Metrics are time-series numbers. You can graph them, alert on them, and see trends.

### Error Tracking (Sentry)
When an unhandled exception occurs in production, Sentry captures:
- The full stack trace
- The request context
- The user who triggered it
- How many times it's occurred

```typescript
try {
    await processBid(gameId, bid);
} catch (err) {
    Sentry.captureException(err, { extra: { gameId, bid } });
    throw err;
}
```

**DSA connection:** Sentry groups errors by their **call stack fingerprint** — a hash of the stack trace. Two occurrences of the same bug have the same fingerprint and are counted together, even if the data (gameId, userId) differs.

---

## Summary: The 8 Issues

| Issue | Category | Core Concept |
|---|---|---|
| #13 Redis adapter | Correctness at scale | Pub/sub across servers |
| #14 Hot/cold state | Performance | Event sourcing + materialized views |
| #15 BullMQ queue | Reliability | Persistent FIFO queue with retries |
| #16 Reconnection | UX correctness | Distributed timer with Redis TTL |
| #17 Service separation | Scalability | Divide and conquer by concern |
| #18 TURN credentials | Security | Short-lived tokens |
| #19 DB indexes | Performance | B+ tree index selection |
| #20 Observability | Operability | Logs, metrics, error tracking |

Each of these is a standard pattern in production systems. Knowing the pattern by name (pub/sub, event sourcing, job queue, circuit breaker) lets you find documentation, battle-tested libraries, and peer implementations quickly.

---

**Return to:** [Module Index](./README.md)
