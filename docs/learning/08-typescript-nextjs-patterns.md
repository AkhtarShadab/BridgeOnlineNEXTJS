# Module 08 — TypeScript & Next.js 14 Patterns

> Session 005 | Prerequisite: Modules 01–03

---

## What This Module Covers

This module is different from the others — it's not about a feature, it's about the **engineering friction** that shows up when you wire a typed Next.js 14 app to Prisma. Every error in this module came from the actual BridgeOnline build. Understanding why they happen and how to fix them will save you hours on any similar project.

---

## Pattern 1 — Next.js 14 App Router: Params Are Now a Promise

### The Error

```
Type error: Route "app/api/rooms/[roomId]/start/route.ts" has an invalid "POST" export:
Type "{ params: { roomId: string; }; }" is not a valid type for the function's second argument.
```

### Why This Happens

In Next.js 13 and early 14, dynamic route parameters were passed as a plain object:

```ts
// Old pattern (Next.js 13 / early 14)
export async function POST(
    req: NextRequest,
    { params }: { params: { roomId: string } }
) {
    const { roomId } = params; // sync access was fine
}
```

In Next.js 14.2+, the runtime changed: params are now resolved **asynchronously**. The type is `Promise<{ roomId: string }>`.

### The Fix

```ts
// Current pattern (Next.js 14.2+)
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ roomId: string }> }
) {
    const { roomId } = await params; // must await
}
```

### Why the Runtime Changed

Dynamic params in Next.js 14 can come from the URL, but also from server-side rendering context, middleware rewrites, and parallel routes. Making params a Promise lets Next.js resolve them lazily — the handler doesn't block while waiting for param resolution to complete in complex routing scenarios.

**Rule of thumb:** Any time you see `params: { id: string }` in an App Router route, change it to `params: Promise<{ id: string }>` and `await params`.

---

## Pattern 2 — TypeScript Literal Narrowing With Mutable Variables

### The Error

```
Type '"PLAYING"' is not assignable to type '"BIDDING"'.
```

This happens in `app/api/games/[gameId]/bid/route.ts` at the line:

```ts
newPhase = 'PLAYING';
```

### Why This Happens

This is TypeScript's control flow analysis narrowing a mutable variable too aggressively.

```ts
// Earlier in the route handler:
if (game.phase !== 'PLAYING') {
    return NextResponse.json({ error: 'Not in playing phase' }, { status: 400 });
}

// At this point, TypeScript KNOWS game.phase is 'PLAYING'
// (all other values were rejected above)

let newPhase = game.phase;
// TypeScript infers newPhase as: let newPhase: "PLAYING"
// Not as: let newPhase: GamePhase
// Because TypeScript tracks what value you assigned, not what type you declared

newPhase = 'SCORING'; // ❌ Type '"SCORING"' is not assignable to type '"PLAYING"'
```

This is actually TypeScript doing its job correctly — it tracked that `newPhase` was narrowed to `"PLAYING"` and the reassignment looks like a bug. But in this case, we genuinely want to reassign it.

### The Fix

Explicitly annotate the variable's type so TypeScript stops narrowing:

```ts
import { GamePhase } from '@prisma/client';

let newPhase: GamePhase = game.phase;
// Now TypeScript knows newPhase can be any GamePhase, not just "PLAYING"

newPhase = GamePhase.PLAYING;    // ✓
newPhase = GamePhase.SCORING;    // ✓
newPhase = GamePhase.COMPLETED;  // ✓
```

### Why Use the Enum, Not a String Literal?

```ts
// Fragile — typos silently produce wrong values
newPhase = 'PLAYIN'; // TypeScript may not catch this

// Safe — Prisma's enum is the source of truth
newPhase = GamePhase.PLAYING; // autocomplete, refactor-safe
```

Prisma generates the `GamePhase` enum from `schema.prisma`. If you rename a phase in the schema, every `GamePhase.X` reference in your code breaks at compile time. String literals silently break at runtime.

---

## Pattern 3 — Prisma JSON Fields and TypeScript Index Signatures

### The Error

```
Type 'ScoringResult' is not assignable to type 'InputJsonValue'
  Type 'ScoringResult' is not assignable to type 'InputJsonObject'.
    Index signature for type 'string' is missing in type 'ScoringResult'.
```

### Why This Happens

Prisma models JSON columns as `Json` in the schema. When writing to a JSON column, Prisma's TypeScript types require `InputJsonValue`, which is defined as:

```ts
type InputJsonValue =
    | string
    | number
    | boolean
    | InputJsonObject   // { [key: string]: InputJsonValue }  ← note: string index signature
    | InputJsonArray
    | null;
```

Your TypeScript types — like `ScoringResult`, `GameState`, or `Card[]` — are strongly typed interfaces. They do **not** have a `[key: string]: InputJsonValue` index signature. The type system can't prove they're valid JSON at compile time.

```ts
interface ScoringResult {
    scoreNS: number;
    scoreEW: number;
    bonus: number;
}
// Missing: [key: string]: InputJsonValue
// So TypeScript rejects: prisma.gameResult.create({ detailedScoring: score })
```

### The Fix

Cast to `object` at the Prisma call site:

```ts
await prisma.gameResult.create({
    data: {
        detailedScoring: score as object, // tells Prisma: trust me, this is valid JSON
    },
});
```

For the initial game state object:
```ts
await prisma.game.create({
    data: {
        gameState: {
            hands: sortedHands,
            bidHistory: [],
            // ...
        } as object,
    },
});
```

**Why `as object` and not `as any`?** `as any` disables type checking entirely — you lose safety on the whole expression. `as object` is narrower: it tells TypeScript "this is some object" without opening the door to arbitrary values. For Prisma JSON fields, it's the minimal cast that satisfies the type constraint.

---

## Pattern 4 — Mismatched Function Names Between Modules

### The Error

```
Attempted import error: 'validateCardPlay' is not exported from '@/lib/game/playing'
Attempted import error: 'evaluateTrick' is not exported from '@/lib/game/playing'
```

### Why This Happens

The API route (`app/api/games/[gameId]/play/route.ts`) was written to import `validateCardPlay` and `evaluateTrick`. The actual exports in `lib/game/playing.ts` are `isValidPlay` and `determineTrickWinner`.

This is a **naming contract mismatch** — the API layer assumed different names than what the game logic layer exported. It happens when two parts of the code are written independently.

### The Fix

```ts
// Before (wrong names)
import { validateCardPlay, evaluateTrick } from '@/lib/game/playing';

// After (actual exported names)
import { isValidPlay, determineTrickWinner } from '@/lib/game/playing';
```

But the fix is not just the import — the call site also assumed a different return shape:

```ts
// Wrong: assumed evaluateTrick returned { seat: string }
const winner = evaluateTrick(currentTrick, trumpSuit);
nextPlayer = game.gamePlayers.find(p => p.seat === winner.seat);

// Correct: determineTrickWinner returns a player ID string
const winnerPlayerId = determineTrickWinner(currentTrick, trumpSuit);
const winnerPlayer = game.gamePlayers.find(p => p.userId === winnerPlayerId);
```

**Lesson:** When fixing an import error, also check that the call site uses the correct argument types and return value shape — the function signature, not just its name, may differ.

---

## Pattern 5 — Test Config Files Getting Type-Checked by the Build

### The Error

```
Type error: Object literal may only specify known properties,
and 'envFile' does not exist in type 'InlineConfig'.
```

This error is in `vitest.config.db.ts`, not in any application code. The Next.js build found it because `tsconfig.json` includes `**/*.ts` — which matches every TypeScript file in the project, including tool config files.

### Why This Happens

Next.js runs TypeScript type checking on everything in `include`. Config files for Vitest, Playwright, etc. use APIs from those testing frameworks — APIs that Next.js's TypeScript compiler has no types for. The result is false errors: valid Vitest config that Next.js wrongly flags as broken.

### The Fix

Exclude test tool config files from the Next.js TypeScript build:

```json
// tsconfig.json
{
  "exclude": [
    "node_modules",
    "vitest.config.ts",
    "vitest.config.db.ts",
    "vitest.config.socket.ts",
    "playwright.config.ts"
  ]
}
```

These files are still type-checked by their own tool when you run `vitest` or `playwright` — you're not losing type safety, just telling Next.js to skip files that aren't part of the app.

---

## Summary: The Five Patterns

| # | Pattern | Root Cause | Fix |
|---|---|---|---|
| 1 | `params` must be awaited | Next.js 14.2+ changed params to Promise | `Promise<{ id: string }>` + `await params` |
| 2 | Literal narrowing blocks reassignment | TypeScript narrows `let` too specifically after `if` checks | Explicit type annotation: `let x: GamePhase` |
| 3 | Typed objects rejected by Prisma JSON fields | Typed interfaces lack `string` index signature | Cast to `object` at call site |
| 4 | Import name mismatch | Two modules written independently with different naming | Fix import name AND verify return shape matches usage |
| 5 | Test configs type-checked by Next.js build | `tsconfig.json` includes `**/*.ts` | Add config files to `exclude` in tsconfig |

---

## Before You Continue

1. Look at `app/api/rooms/[roomId]/seat/route.ts`. Does it use the old or new params pattern?
2. What would happen at runtime if you forgot to `await params` in a Next.js 14 route?
3. Why is `as object` safer than `as any` when casting for Prisma JSON fields?
4. If you add a new phase `PAUSED` to the `GamePhase` enum in `schema.prisma`, where in the application code would TypeScript catch broken references — and where would it not?

---

**Return to:** [Module Index](./README.md)
