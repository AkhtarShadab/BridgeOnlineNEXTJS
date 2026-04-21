# Module 03 — Database Design with Prisma

> Session 003 | Prerequisite: Module 01

---

## Why a Relational Database, and Why PostgreSQL Specifically

### What "persistence" means

Everything that exists only in a running program's memory disappears when the program stops — server restart, crash, deployment. For a game:
- Which players are in which rooms? → must persist across restarts
- What bids were made in what order? → must survive a crash mid-game
- What was the final score? → must be queryable weeks later for statistics

Persistence means storing data outside program memory, on disk, so it survives the program stopping.

### Why relational (tables with foreign keys) and not document (MongoDB)

The game's data has strict, non-optional relationships:
- A `GameMove` must belong to a `Game` that actually exists
- A `GamePlayer` must reference a `User` that actually exists and a `GameRoom` that actually exists
- A `GameResult` must be unique per `Game` — you can't have two result records for one game

In a **relational database**, these relationships are enforced by the database engine as **foreign key constraints**. An INSERT that violates a foreign key is rejected immediately — your application never has to handle "data that references something that doesn't exist."

In MongoDB (a document database), there are no enforced foreign keys. You store documents with fields that might reference other documents. Nothing stops you from creating a `game_move` document with a `game_id` that doesn't correspond to any game. Your application code has to check this itself — and if it has a bug, you silently get invalid data.

**The engineering trade-off:** MongoDB is more flexible (you can store any structure without defining it upfront) but less safe (no enforcement of your data model). PostgreSQL is stricter (you define the schema first) but safer (violations are caught at storage time, not at application time). For a game where data integrity is critical, the strictness is an advantage.

### Why PostgreSQL specifically over MySQL or SQLite

**MySQL:** Also relational and production-ready. The ecosystem split between MySQL and PostgreSQL comes down to feature set. PostgreSQL has `JSONB` columns (binary JSON with indexing and querying support), better full-text search, and `ARRAY` types. The `JSONB` column is used for `game_state` — this would be harder with MySQL.

**SQLite:** An embedded, file-based relational database. No separate server process needed, great for local development and testing. The critical limitation: SQLite allows only one writer at a time. In production with multiple concurrent games, multiple server processes would compete for write access and block each other. Ruled out for production multi-server deployment.

---

## What Prisma Is and Why It's Used

**ORM** stands for **Object-Relational Mapper**. It is a library that sits between your application code and the database, translating between the application's object model (TypeScript classes and interfaces) and the database's relational model (tables and rows).

Without Prisma, you write raw SQL:
```typescript
const result = await pool.query(
    `SELECT gr.*, u.username as creator_username
     FROM game_rooms gr
     JOIN users u ON u.id = gr.creator_id
     WHERE gr.invite_code = $1 AND gr.expires_at > NOW()`,
    [inviteCode]
);
const room = result.rows[0]; // TypeScript type: any
```

With Prisma:
```typescript
const room = await prisma.gameRoom.findFirst({
    where: { inviteCode, expiresAt: { gt: new Date() } },
    include: { creator: { select: { username: true } } }
});
// TypeScript type: (GameRoom & { creator: { username: string } }) | null
```

**Three concrete advantages of Prisma:**

**1. Type safety throughout.** Prisma generates TypeScript types from your schema. Every model, every field, every relation is typed. `room.inviteCode` is a `string`, not `any`. `room.creator.username` is a `string`. If you access a field that doesn't exist, TypeScript shows an error at compile time.

**2. Schema as single source of truth.** `prisma/schema.prisma` defines the database structure. Prisma generates both the TypeScript types and the SQL from this one file. You never have to keep a TypeScript interface and a SQL table definition in sync manually.

**3. Rename refactoring works.** If you rename `inviteCode` to `shareCode` in the schema, every Prisma query that uses `inviteCode` gets a compile error immediately. With raw SQL strings, a rename would break at runtime — when a query actually runs and the column doesn't exist.

**Alternative ORMs considered:**

*Drizzle ORM*: A newer TypeScript ORM with excellent type safety and performance closer to raw SQL. Drizzle uses a different model — you define the schema in TypeScript files, not a `.prisma` schema file, which means better tree-shaking. The trade-off: less mature ecosystem, less documentation, fewer examples. For a learning-focused project, Prisma's explicit schema file, visual Studio tooling, and Prisma Studio (a visual DB browser) are more beginner-friendly.

*TypeORM*: An older ORM with decorator-based schema definition. Has historically struggled with TypeScript strict mode and has known type safety gaps. Less recommended for new projects.

*Raw SQL (node-postgres)*: Maximum control, maximum performance, no abstraction tax. The cost: all type safety is manual, refactoring is error-prone, complex queries are verbose. For a project where the schema is relatively stable and the team is small, the Prisma abstraction is worth it.

---

## The Schema Explained: Every Annotation

```prisma
// prisma/schema.prisma

generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")
    directUrl = env("DIRECT_URL")
}
```

`generator client` tells Prisma to generate a TypeScript client. `datasource db` tells Prisma which database to connect to. Two URLs are specified:
- `DATABASE_URL`: the connection URL used for normal queries, may go through a connection pooler (like PgBouncer)
- `DIRECT_URL`: a direct connection, used for migrations which cannot go through a connection pooler

### The User Model

```prisma
model User {
    id            String    @id @default(uuid())
    email         String    @unique
    username      String    @unique
    passwordHash  String    @map("password_hash")
    avatarUrl     String?   @map("avatar_url")
    stats         Json      @default("{\"gamesPlayed\": 0, \"gamesWon\": 0, \"totalScore\": 0}")
    createdAt     DateTime  @default(now()) @map("created_at")
    lastLogin     DateTime? @map("last_login")

    // Relations (not stored as columns — tells Prisma how to join)
    gameRooms           GameRoom[]
    gamePlayers         GamePlayer[]

    @@index([email])
    @@index([username])
    @@map("users")
}
```

**`@id`** — Marks this as the primary key. Every table must have a primary key — a column (or set of columns) whose value uniquely identifies each row. Without it, there's no reliable way to refer to a specific row.

**`@default(uuid())`** — When a User is inserted without an `id` value, Prisma generates a UUID (Universally Unique Identifier, like `550e8400-e29b-41d4-a716-446655440000`). UUIDs are generated algorithmically and are effectively unique across all machines and all time. This means you can generate a user ID in your application before inserting into the database — useful for distributed systems.

*Alternative: auto-increment integer IDs.* Integers (`@default(autoincrement())`) are smaller (8 bytes vs 36 chars) and slightly faster. The trade-off: sequential integer IDs leak information (user number 42 tells you this is an early user), make distributed ID generation harder (you need a central counter), and make URL prediction possible (`/users/42` → try `/users/43`). UUIDs don't have these problems.

**`@unique`** — Creates a unique constraint at the database level. Two users can't have the same email address. Unlike an application-level check (`if await prisma.user.findFirst({ where: { email } }) then throw error`), the database constraint is atomic — two concurrent registrations with the same email cannot both succeed even if they both pass the application check simultaneously.

**`@map("password_hash")`** — The Prisma model uses camelCase (`passwordHash`) as is conventional in TypeScript/JavaScript. The database column uses snake_case (`password_hash`) as is conventional in SQL. `@map` handles this conversion. Without it, you'd have to use one naming convention everywhere, which either makes your TypeScript awkward or your SQL awkward.

**`@@map("users")`** — The Prisma model is named `User` (PascalCase, singular) which is conventional in TypeScript. The database table is `users` (snake_case, plural) which is conventional in SQL. `@@map` handles this discrepancy.

**`@@index([email])`** — Creates a B-tree index on the email column. Without this, every `findFirst({ where: { email: 'alice@...' } })` requires scanning every row in the users table. With the index:

```
Without index: O(N) rows scanned — 1M users = 1M rows scanned per login
With B-tree index: O(log N) — 1M users = ~20 node traversals per login
```

The cost: indexes take up disk space (roughly the same size as the indexed column's data) and slow down INSERTs slightly (the index must be updated). For a column you query frequently (email on every login), this trade-off strongly favours indexing.

### The GameRoom Model

```prisma
model GameRoom {
    id         String     @id @default(uuid())
    inviteCode String     @unique @map("invite_code")
    creatorId  String     @map("creator_id")
    status     RoomStatus @default(WAITING)
    expiresAt  DateTime   @map("expires_at")
    settings   Json       @default("...")

    creator     User         @relation(fields: [creatorId], references: [id], onDelete: Cascade)
    gamePlayers GamePlayer[]
    games       Game[]

    @@index([inviteCode])
    @@index([creatorId])
    @@index([status])
    @@map("game_rooms")
}
```

**`@relation(fields: [creatorId], references: [id], onDelete: Cascade)`** — This defines a foreign key constraint:
- `fields: [creatorId]` — the column in this table that holds the reference
- `references: [id]` — the column in the related table (User) that is referenced
- `onDelete: Cascade` — if the referenced User is deleted, all their GameRooms are also deleted automatically

`onDelete: Cascade` is an intentional choice. Alternative `onDelete` behaviours:
- `Restrict` (default) — prevent deleting the User if they have GameRooms. Forces you to delete rooms first.
- `SetNull` — set `creatorId` to NULL when the user is deleted. Requires `creatorId` to be nullable.
- `Cascade` — delete all related rooms when the user is deleted.

For a game application where deleted users should leave no orphaned data, `Cascade` is appropriate for most relations. For `GameMove`, the `onDelete` is `Restrict` on the `player` relation — you don't want to be able to delete a user who made moves in a game (their history should be preserved).

### The GamePlayer Model: Schema-Level Game Rule Enforcement

```prisma
model GamePlayer {
    id         String       @id @default(uuid())
    gameRoomId String       @map("game_room_id")
    userId     String       @map("user_id")
    seat       SeatPosition
    isReady    Boolean      @default(false) @map("is_ready")

    gameRoom GameRoom @relation(fields: [gameRoomId], references: [id], onDelete: Cascade)
    user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@unique([gameRoomId, seat])    // Rule: two players cannot sit in the same seat
    @@unique([gameRoomId, userId])  // Rule: a player cannot join the same room twice
    @@map("game_players")
}
```

The two `@@unique` constraints encode game rules at the database level. This is a critical decision:

**Without schema constraints:**
```typescript
// Application-level seat check — vulnerable to race conditions
async function takeSeat(roomId, userId, seat) {
    const existing = await prisma.gamePlayer.findFirst({
        where: { gameRoomId: roomId, seat }
    });
    if (existing) throw new Error('Seat taken');  // Race window here!
    await prisma.gamePlayer.create({ data: { gameRoomId: roomId, userId, seat } });
}
```

Two players could simultaneously call `takeSeat` for the same seat, both find no existing player, both proceed to insert — and you end up with two players in the same seat. This is a classic **race condition** in concurrent systems.

**With schema constraints:**
The database uses **serialisable** or **read committed** isolation to handle concurrent inserts. The unique constraint is checked atomically during the INSERT. One of the two concurrent inserts succeeds; the other gets a unique constraint violation error. No double-seated players possible.

**The principle:** Push your invariants as deep as possible. Application code can have bugs. Schema constraints cannot (they are enforced by the database engine).

---

## Enums: Constraining State to Valid Values

```prisma
enum RoomStatus {
    WAITING
    READY
    IN_PROGRESS
    COMPLETED
    ABANDONED
    @@map("room_status")
}
```

An enum column in PostgreSQL is a type that can only hold one of its defined values. Setting `status = "started"` is a type error — the database rejects it.

**Why not use a string column with application-level validation?**

With a string column, you might have some rows with `status = "WAITING"`, others with `status = "waiting"` (lowercase), and a bug somewhere that wrote `status = "in_progress"` (different format). Each code path that reads status has to handle all these variations.

With an enum:
- The database guarantees only `WAITING`, `READY`, `IN_PROGRESS`, `COMPLETED`, `ABANDONED` can ever exist
- TypeScript Prisma client gives you `RoomStatus.WAITING` etc. — autocomplete, no typos possible
- Database-level documentation: the column's type tells you exactly what values are valid

**Alternatives:** Integer codes (0=WAITING, 1=READY, ...) are more compact but completely opaque in database queries — `WHERE status = 2` vs `WHERE status = 'IN_PROGRESS'`. String enums are always preferred for readability.

---

## JSONB Columns: Flexibility Within a Strict Schema

Some data is inherently fluid. The game state during play has many optional fields that change format across game phases:

```typescript
// During bidding:
gameState = {
    phase: 'BIDDING',
    currentBid: { level: 2, suit: 'NT' },
    bidHistory: [...],
    hands: { NORTH: [...], SOUTH: [...], ... },
    vulnerability: { NS: false, EW: false }
}

// During playing:
gameState = {
    phase: 'PLAYING',
    contract: { level: 3, suit: 'NT', declarer: 'NORTH', doubled: false },
    currentTrick: [{ player: 'NORTH', card: 'AS' }, ...],
    tricks: [...],
    hands: { NORTH: [...remaining cards...], ... }
}
```

These two phases have completely different fields. If you tried to model this as strict typed columns:
```sql
-- Impossible to cleanly represent both phases in typed columns
ALTER TABLE games ADD COLUMN current_bid_level INT;
ALTER TABLE games ADD COLUMN current_bid_suit VARCHAR(2);
ALTER TABLE games ADD COLUMN current_trick JSONB;  -- give up and use JSON anyway
```

PostgreSQL's `JSONB` column stores arbitrary JSON as binary (faster than text JSON, supports indexing into the structure). It's the right tool for genuinely variable structure.

**The principle: be strict about what you can be strict about, flexible where you must be.** The room's `status`, `inviteCode`, and `creatorId` are strict typed columns. The game's volatile state snapshot is JSONB. Both live in the same table.

**Alternative: separate tables for each game phase.** You could have a `bidding_state` table and a `playing_state` table. This gives you strict typing but requires complex joins and schema migrations when the state structure changes. For a game that evolves frequently during development, JSONB is more pragmatic.

---

## Test Database Isolation: Why Docker?

Tests need a database, but they must not touch the production database. The project uses Docker to spin up an isolated PostgreSQL instance for tests only.

```yaml
# docker-compose.test.yml
services:
  test-db:
    image: postgres:16-alpine   # "alpine" = minimal Linux image (~5MB vs ~200MB)
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: bridgeonline_test
    ports:
      - "5433:5432"   # host:container — 5433 on your machine, 5432 inside Docker
    tmpfs:
      - /var/lib/postgresql/data  # store data in RAM, not disk
```

**`tmpfs` (temporary filesystem in RAM):** PostgreSQL normally stores all data on disk. With `tmpfs`, the data directory is a RAM disk — writes go to memory, not to the physical disk. This makes tests 3–10× faster (no disk I/O). More importantly, when the container stops, the RAM is freed and all data is gone. Next time you start it, it's completely clean. This is intentional — you want each test run to start from a known empty state.

**Port mapping `5433:5432`:** PostgreSQL always listens on port 5432 inside Docker. Mapping to `5433` on the host means your test commands use port 5433, preventing collision with any local PostgreSQL running on the default port 5432.

**Why not use SQLite for tests?** A common pattern is to use SQLite in tests (no Docker needed). The problem: SQLite doesn't support all PostgreSQL features. `JSONB` columns don't exist in SQLite. PostgreSQL-specific enum types don't work in SQLite. Testing against a different database than production means you can have bugs that only show up in production (e.g., a query that works in SQLite but fails in PostgreSQL). Always test against the same database engine you deploy to.

---

## The Concurrency Bug Found and Fixed in Session 004

### What happened

The `vitest.config.db.ts` had `singleFork: true`. This means all test files run in a single OS process (good — avoids spinning up multiple database connections). But Vitest still runs test files concurrently within that process by default.

With two test files running concurrently:

```
Time:                  T1          T2          T3          T4          T5
rooms.test.ts:       beforeEach  createUser  createRoom  test pass
games.test.ts:  beforeEach                              createUser  FK violation!
                (cleanDatabase
                  deletes users
                  from T2)
```

File A's `beforeEach(cleanDatabase)` ran at T1, deleting all users. File B had just created a user at T2 and was about to create a room at T3 — but the user was gone. Foreign key violation.

### Why `singleFork: true` alone wasn't enough

`singleFork` controls the *number of processes* (forks), not *concurrency within a process*. The database is shared state — tests from different files racing to read and write it produce non-deterministic results. This is a database-level race condition.

### The fix

```typescript
// vitest.config.db.ts
export default defineConfig({
    test: {
        singleFork: true,
        fileParallelism: false,  // ← this is what fixed it
        ...
    }
});
```

`fileParallelism: false` makes test files run strictly sequentially: File A completes entirely before File B starts. The database state is never corrupted by concurrent access.

**The trade-off:** Sequential file execution is slower. With 4 test files, you lose the parallelism benefit. For DB tests, this is acceptable — the bottleneck is database I/O, not CPU. Unit tests (`vitest.config.ts`) don't touch a database and remain fully parallel.

**Alternative solution: transactions that roll back.** Instead of `cleanDatabase()` in `beforeEach`, wrap each test in a transaction and roll it back after:
```typescript
beforeEach(async () => {
    await prisma.$executeRaw`BEGIN`;
});
afterEach(async () => {
    await prisma.$executeRaw`ROLLBACK`;
});
```
Rollback-based isolation is faster (no delete + re-insert, just rollback) and allows files to run concurrently (each file has its own transaction). Prisma's current architecture makes this pattern complex to implement reliably. The `fileParallelism: false` fix is simpler and correct.

---

## Clean-Up Order: Why FK Constraints Matter During Deletes

```typescript
export async function cleanDatabase() {
    // Level 3 — leaf tables (no table depends on these)
    await testPrisma.$transaction([
        testPrisma.gameResult.deleteMany(),
        testPrisma.gameMove.deleteMany(),
        testPrisma.roomInvitation.deleteMany(),
    ]);

    // Level 2 — depend on games and rooms
    await testPrisma.$transaction([
        testPrisma.gamePlayer.deleteMany(),
        testPrisma.game.deleteMany(),
    ]);

    // Level 1 — depend only on users
    await testPrisma.$transaction([
        testPrisma.gameRoom.deleteMany(),
        testPrisma.friendship.deleteMany(),
    ]);

    // Level 0 — the root table, depends on nothing
    await testPrisma.user.deleteMany();
}
```

This deletion order mirrors the FK dependency tree:

```
users
├── game_rooms (creator_id → users.id)
│   ├── game_players (game_room_id → game_rooms.id)
│   │   └── (game_id → games.id)
│   └── games (game_room_id → game_rooms.id)
│       ├── game_moves (game_id → games.id)
│       └── game_results (game_id → games.id)
├── friendships (requester_id, addressee_id → users.id)
└── room_invitations (room_id → game_rooms.id)
```

You can only delete a node after all nodes that point to it are deleted. You must delete leaf nodes before internal nodes before the root — which is exactly the **post-order traversal** of a tree.

**DSA connection:** Tree post-order traversal. In DFS on a tree: left subtree, right subtree, then root. In FK cleanup: children first, parents last.

---

## Key Takeaways

| Concept | Decision | Reason |
|---|---|---|
| PostgreSQL | Over MongoDB | FK enforcement, ACID, JSONB |
| UUID primary keys | Over auto-increment | No info leakage, distributed generation |
| Schema-level constraints | Over app-level only | Race-condition proof |
| `@@unique` on seat+room | Application rule in schema | Game invariant enforced by DB |
| JSONB for game state | Over strict columns | Volatile structure, changes per phase |
| Docker test DB | Over SQLite | Tests run against real DB engine |
| `fileParallelism: false` | Over concurrent files | Shared DB state, race condition fix |
| Prisma | Over raw SQL | Type safety, schema as single source |

---

**Next:** [Module 04 — Real-Time with Socket.io](./04-realtime-socketio.md)
