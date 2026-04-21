# Module 02 — Game Logic as Pure Functions

> Session 002 | Prerequisite: Module 01

---

## What Is a Pure Function?

A **pure function** is a function that:
1. Given the same inputs, always returns the same output — no matter when or how many times it's called
2. Has no **side effects** — it does not modify anything outside itself (no writing to a database, no HTTP requests, no modifying global variables, no `console.log` that you care about)

```typescript
// Pure function — depends only on inputs, modifies nothing outside
function add(a: number, b: number): number {
    return a + b;
}

// NOT pure — reads from a database (external state)
async function getUser(id: string): Promise<User> {
    return db.query(`SELECT * FROM users WHERE id = $1`, [id]);
}

// NOT pure — modifies an external variable (side effect)
let count = 0;
function increment(): void {
    count++;  // modifies external state
}
```

**Why pure functions matter enormously in a game:**

In a card game, correctness is non-negotiable. If `calculateScore` returns the wrong number, players are cheated. If `validateBid` incorrectly accepts an invalid bid, the game rules are broken. You need to be able to test these functions exhaustively — every case, every edge case, hundreds of times in seconds — without spinning up a database or a WebSocket server.

Pure functions give you this: `calculateScore({ level: 6, suit: 'S', ... }, 12, 'NS', { NS: false, EW: false })` always returns `980`. You test it by calling it. That's it.

---

## The `lib/game/` Architecture Decision

All game logic lives in `lib/game/`:

```
lib/game/
  deck.ts        — card generation, shuffle, dealing
  bidding.ts     — bid validation, auction rules, contract determination
  playing.ts     — card play validation, trick winner determination
  scoring.ts     — ACBL duplicate bridge scoring formula
  cardUtils.ts   — card format conversion utilities
  gameEngine.ts  — vulnerability table, dealer rotation, player order
```

**Why this is a separate directory from `server/`:**

The Socket.io server (`server/index.js`) handles I/O — receiving events from sockets, reading/writing state, broadcasting to rooms. The game logic files handle computation — given these inputs, what is the correct output?

If you mixed them together (validation logic inside Socket.io handlers), you'd be forced to test game logic by spinning up a test server, connecting a client, emitting events, and waiting for responses. That's 50–100× slower and much harder to set up. By keeping logic separate, you can test `validateBid(...)` in a microsecond.

**Why `lib/` and not `src/game/` or `utils/game/`?**

In Next.js projects, `lib/` is the conventional location for shared business logic. `src/` is an alternative layout (some teams prefer it to keep all source code under one folder). `utils/` typically implies stateless utility functions — naming this `lib/game/` signals "this is substantive business logic, not just a utility."

---

## Card Representation: Why a String

Bridge uses a standard 52-card deck. Each card is a rank (2, 3, 4, 5, 6, 7, 8, 9, T, J, Q, K, A) and a suit (Clubs, Diamonds, Hearts, Spades).

The project represents each card as a 2-character string: `"AS"` = Ace of Spades, `"TC"` = Ten of Clubs, `"2H"` = Two of Hearts.

**Why a string and not an object like `{ rank: 'A', suit: 'S' }`?**

Consider what you do with cards:
- Store a hand: `["AS", "KS", "QH", "JC", ...]` — a simple array of strings
- Check if a card is in the hand: `hand.includes("AS")` — uses primitive string equality
- Serialize to JSON for the database: `JSON.stringify(hand)` — works for free on string arrays
- Log for debugging: `console.log(hand)` — `["AS", "KS"]` is immediately readable
- Transmit over WebSocket: strings serialize efficiently

With an object:
- Check if in hand: requires `hand.some(c => c.rank === 'A' && c.suit === 'S')` — more verbose, slower
- Serialization works but produces `[{"rank":"A","suit":"S"},...]` — more bytes
- Equality: `{ rank: 'A', suit: 'S' } === { rank: 'A', suit: 'S' }` is `false` in JavaScript (object reference equality) — you need a custom comparator

**The trade-off:** Reading the rank and suit requires `card[0]` and `card[1]` instead of `card.rank` and `card.suit`. The string indexing is marginally less readable but the advantages in storage, comparison, and serialization outweigh this.

**The alternative considered:** Some implementations use numeric card IDs (0–51). This is even more compact but completely unreadable in logs and tests. The 2-character string format strikes the right balance.

---

## `generateDeck` and `shuffleDeck` — The Algorithms

### Generating the Deck

```typescript
// lib/game/deck.ts

const SUITS = ['C', 'D', 'H', 'S'] as const;
const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'] as const;

export function generateDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push(`${rank}${suit}` as Card);
        }
    }
    return deck;
}
```

Two nested loops, O(52) time, O(52) space. The deck is always generated in the same order (2C, 3C, ... AC, 2D, ... AS). That's fine because shuffling is the next step.

### Why Fisher-Yates and Not `sort(() => Math.random() - 0.5)`?

The naive approach:
```typescript
deck.sort(() => Math.random() - 0.5); // WRONG — biased
```

This is widely used but mathematically incorrect. Here's why:

JavaScript's `sort` uses a comparison-based algorithm (typically TimSort). It calls the comparator function multiple times to determine order. `Math.random() - 0.5` returns a random positive or negative number each time. The problem: for a comparison-based sort to produce a uniform random permutation, each possible permutation must be equally likely. But the number of times `sort` calls the comparator function is not constant — it depends on the input. Some permutations are "reached" more often than others. The bias is measurable.

**Fisher-Yates Shuffle:**

```typescript
export function shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck];  // copy to avoid mutating the input
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));  // random index 0..i
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];  // swap
    }
    return shuffled;
}
```

**Step-by-step trace for a 4-card deck [A, B, C, D]:**

```
i=3: j = random(0..3), say j=1 → swap index 3 and 1 → [A, D, C, B]
i=2: j = random(0..2), say j=2 → swap index 2 and 2 → [A, D, C, B] (no change)
i=1: j = random(0..1), say j=0 → swap index 1 and 0 → [D, A, C, B]
done
```

**Why it's unbiased:** At step `i`, we uniformly pick any of the `i+1` positions (0..i) to place the card at position `i`. The probability that any specific card ends up in any specific position is exactly 1/N. This is provably O(N) time and O(1) extra space (in-place).

**DSA connection:** The sort-based approach is O(N log N) comparisons, each using a fresh random number, leading to bias. Fisher-Yates is O(N) random numbers, each used exactly once, producing a provably uniform distribution.

---

## Bidding: Constraint Validation on a Sequence

The bidding auction is a sequence of actions. Each action must be valid given the entire history of actions before it. This is a **constraint validation problem** on a sequential structure.

### The Bid Type System

```typescript
// lib/game/bidding.ts

export type BidSuit = 'C' | 'D' | 'H' | 'S' | 'NT';
export type BidLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Bid {
    level: BidLevel;
    suit: BidSuit;
    doubled?: boolean;
    redoubled?: boolean;
}

export interface BidAction {
    type: 'bid' | 'pass' | 'double' | 'redouble';
    bid?: Bid;        // only present when type === 'bid'
    player: string;   // player userId
    seat?: string;    // NORTH | SOUTH | EAST | WEST
}
```

**Why TypeScript union types like `type BidSuit = 'C' | 'D' | 'H' | 'S' | 'NT'`?**

This is a **literal union type** — the variable can only hold one of these exact string values. If you write `bid.suit = 'X'`, TypeScript gives a compile error. This is better than a plain `string` type because the compiler verifies at compile time that you can't accidentally use an invalid suit.

For a card game where incorrect suit values would break the scoring logic, this compile-time safety is valuable.

### Encoding Suit Hierarchy as a Lookup Map

Bridge suit hierarchy for bidding: ♣ < ♦ < ♥ < ♠ < NT (No Trump).

```typescript
const SUIT_ORDER: Record<BidSuit, number> = {
    'C': 1,
    'D': 2,
    'H': 3,
    'S': 4,
    'NT': 5
};
```

**Why a map instead of if-else?**

Option A — if-else chain:
```typescript
function isSuitHigher(a: BidSuit, b: BidSuit): boolean {
    if (a === 'NT') return true;
    if (b === 'NT') return false;
    if (a === 'S') return b !== 'S';
    if (a === 'H') return b === 'C' || b === 'D';
    if (a === 'D') return b === 'C';
    return false;
}
```
This is 8 lines, hard to verify correct, and will break if you add a suit.

Option B — lookup map (actual implementation):
```typescript
function isSuitHigher(a: BidSuit, b: BidSuit): boolean {
    return SUIT_ORDER[a] > SUIT_ORDER[b];
}
```
Two lines, O(1) lookup, obviously correct. If you change the suit order, you change one number in the map.

**DSA connection:** This is the "encode ordered values as a hash map (symbol → rank)" pattern. You see it in: graph algorithms (vertex → index), dynamic programming (character → cost), competitive programming (element → sorted position). The key insight is that a map converts an abstract ordering into a numerical ordering you can compare with `>`.

### Detecting Auction End: Sliding Window

```typescript
export function isBiddingComplete(history: BidAction[]): boolean {
    if (history.length < 4) return false;

    const lastThree = history.slice(-3);
    const allPasses = lastThree.every(a => a.type === 'pass');
    const hasBidBefore = history.some(a => a.type === 'bid');

    return allPasses && hasBidBefore;
}
```

**Why `history.length < 4`?** The minimum valid auction is 3 passes (all 4 players pass — a "passed-out board"). Wait, that's 4 passes with no bid, which the `hasBidBefore` check handles. The minimum auction with a bid is: bid + 3 passes = 4 actions total.

**Why look only at the last 3 actions?** The auction ends only when 3 consecutive passes occur after any bid. The word "consecutive" means we only care about the suffix. We don't need to scan the whole history again — we can check the last 3 elements. This is a **fixed-size sliding window** of size 3.

**DSA connection:** Sliding window is a classic pattern for "does the last K elements satisfy condition X?" Instead of O(N) re-scan per check, we look at O(K) elements. Here K=3, making it O(1) regardless of auction length.

**Edge case — the passed-out board:** The `hasBidBefore` check is crucial. If all 4 players pass with no bid, `lastThree.every(pass)` would be true after 3 passes, but `hasBidBefore` is false, so the function correctly returns false. A passed-out board (4 passes, no bid) is handled differently — the game moves directly to scoring with 0 points to both sides.

### Finding the Declarer: Linear Scan with Predicate

The **declarer** is defined as: the first player from the winning partnership who bid the contract suit during this auction.

This is subtle. Consider:
- North bids 1♠
- East passes
- South bids 4♠  ← this is the final contract
- West passes, North passes, East passes → auction ends

The final bid was 4♠ by South. But North bid ♠ first. The declarer is **North**, not South, because North first introduced spades.

```typescript
export function determineContract(history: BidAction[]): Contract | null {
    if (!isBiddingComplete(history)) return null;

    // Find the last bid (final contract)
    const lastBidAction = [...history].reverse().find(a => a.type === 'bid');
    if (!lastBidAction) return null;

    const contractSuit = lastBidAction.bid!.suit;
    const winningTeam = getPlayerTeam(lastBidAction.player); // 'NS' or 'EW'

    // Scan forward from the beginning for the first player from winning team who bid this suit
    const declarerAction = history.find(
        a => a.type === 'bid' &&
             a.bid!.suit === contractSuit &&
             getPlayerTeam(a.player) === winningTeam
    );

    return {
        ...lastBidAction.bid!,
        declarer: declarerAction!.player,
    };
}
```

**Two passes through the array:**
1. `[...history].reverse().find(...)` — O(N) to find the last bid action
2. `history.find(...)` — O(N) forward scan to find the first bid of that suit by that team

Total: O(N) where N = auction length. The auction can have at most ~35 actions (7 levels × 5 suits = 35 possible bids + passes), so N is bounded by a small constant in practice.

**Why `[...history].reverse()` instead of `history.findLast()`?**

`Array.prototype.findLast()` is a newer ES2023 method. At the time this was written, compatibility was not universal. Copying and reversing is safe in all environments. For a 35-element array, the copy cost is negligible.

---

## Scoring: Decomposing a Complex Formula

The ACBL duplicate bridge scoring table has ~40 distinct cases. A naive implementation would be a giant if-else tree with nested conditions. The better approach is **decomposition** — break the total score into independent additive components:

```
Total Score = trick_score + overtrick_bonus + game_bonus + slam_bonus + insult_bonus − undertrick_penalty
```

Each component is computed independently with its own clean formula:

```typescript
// lib/game/scoring.ts (simplified and annotated)

export function calculateScore(
    contract: ContractScoring,
    tricksWon: number,
    declarer: 'NS' | 'EW',
    vulnerability: { NS: boolean; EW: boolean }
): ScoringResult {
    const requiredTricks = 6 + contract.level;  // e.g., 3NT = 6+3 = 9 tricks needed
    const isVulnerable = vulnerability[declarer];
    const overtricks = tricksWon - requiredTricks; // negative = undertricks

    if (overtricks >= 0) {
        // Contract made
        const basePoints = calculateBasePoints(contract.level, contract.suit);
        const trickScore = contract.doubled ? basePoints * 2
                         : contract.redoubled ? basePoints * 4
                         : basePoints;

        const isGame = trickScore >= 100;
        const gameBonus = isGame ? (isVulnerable ? 500 : 300) : 50;

        // Slam bonus: level 6 = small slam, level 7 = grand slam
        const slamBonus =
            contract.level === 7 ? (isVulnerable ? 1500 : 1000) :
            contract.level === 6 ? (isVulnerable ? 750 : 500) : 0;

        // ... overtrick bonuses, insult bonus
        return buildResult(trickScore + gameBonus + slamBonus + ...);
    } else {
        // Contract failed — compute undertrick penalties
        return buildPenalty(undertricks, isVulnerable, contract.doubled, contract.redoubled);
    }
}
```

### Why Decompose Instead of One Big Switch Statement?

A single switch over all ~40 cases:
```typescript
switch (`${contract.level}${contract.suit}-${vulnerability}-${doubled}`) {
    case '1C-notVul-undoubled': return 70; // 20 trick + 50 partscore
    case '1C-notVul-doubled': return ...;
    // ... 38 more cases
}
```

Problems:
- Any change to the scoring formula requires finding the right cases (easy to miss one)
- Impossible to test individual components (what if the game bonus is right but the slam bonus is wrong?)
- No way to add a new bonus type without touching every case

With decomposition:
- Each component (game bonus, slam bonus, overtrick) has its own formula and its own test
- A bug in the slam bonus calculation is immediately isolated — only the slam bonus test fails
- Adding a new scoring component is adding a new function, not modifying existing ones

**DSA connection:** This is the **separation of concerns** principle at the function level — the same reasoning that motivates dividing algorithms into sub-problems in divide-and-conquer.

### The `calculateBasePoints` Function

```typescript
function calculateBasePoints(level: number, suit: BidSuit): number {
    // Notrump: 40 for the first trick, 30 for each subsequent
    if (suit === 'NT') return 40 + (level - 1) * 30;
    // Majors (Hearts, Spades): 30 per trick
    if (suit === 'H' || suit === 'S') return level * 30;
    // Minors (Clubs, Diamonds): 20 per trick
    return level * 20;
}
```

Notice: 3NT = 40 + 2×30 = 100 points (game). 4♥ = 4×30 = 120 points (game). 5♣ = 5×20 = 100 points (game). These are the game thresholds — the ACBL scoring formula is designed so you need to reach a specific contract level in each suit to score a game bonus. The formula correctly implements these thresholds without any hardcoded lookup tables.

---

## Trick Winner: Multi-Level Priority Comparison

```typescript
// lib/game/playing.ts

export function determineTrickWinner(
    trick: { player: string; card: Card }[],
    trumpSuit: BidSuit | null
): string {
    const ledSuit = trick[0].card[1];  // the suit of the first card played

    let winner = trick[0];

    for (const play of trick.slice(1)) {
        const playRank = play.card[0];
        const playSuit = play.card[1];

        const currentWinnerIsTrump = winner.card[1] === trumpSuit;
        const newPlayIsTrump = playSuit === trumpSuit;

        if (newPlayIsTrump && !currentWinnerIsTrump) {
            // A trump card beats any non-trump card
            winner = play;
        } else if (newPlayIsTrump && currentWinnerIsTrump) {
            // Both are trump — higher trump rank wins
            if (RANK_ORDER[playRank] > RANK_ORDER[winner.card[0]]) {
                winner = play;
            }
        } else if (!currentWinnerIsTrump && playSuit === ledSuit) {
            // Neither is trump — higher card of the led suit wins
            if (RANK_ORDER[playRank] > RANK_ORDER[winner.card[0]]) {
                winner = play;
            }
        }
        // else: off-suit, non-trump card — has no power in this trick
    }

    return winner.player;
}
```

**The three-tier priority:**
1. Trump > everything else (regardless of rank)
2. Among non-trump: led suit > off-suit (regardless of rank)
3. Among cards of equal status: higher rank wins

This is the "find maximum in an array" algorithm, but with a **custom 3-level comparator**. The `winner` variable tracks the current best card seen so far, and is updated whenever a "better" card is played.

**DSA connection:** This is the classic linear scan maximum pattern: O(N) where N=4 cards. The comparator has 3 levels of priority. You see multi-level comparators in sorting algorithms too: sort by last name, then by first name, then by age.

**Why not sort the trick and take the first element?**

```typescript
// Don't do this:
const winner = trick.sort(compareCards)[0];
```

Sorting a 4-element array is O(4 log 4) ≈ 8 comparisons. The linear scan is O(4) = 4 comparisons. For such a small array the difference is negligible, but more importantly, sorting mutates the array and changes its order — the trick's original play order (which card was played first = the led suit) is information you need to preserve.

---

## The Known Bug: `getNextPlayer` Turn Order

```typescript
// lib/game/playing.ts

export function getNextPlayer(current: SeatPosition): SeatPosition {
    const order: SeatPosition[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
    const idx = order.indexOf(current);
    return order[(idx + 1) % 4];
}
```

**Current (wrong) order:** North → South → East → West → North

**Correct Bridge clockwise order:** North → East → South → West → North

The correct mapping: if North is at the top of the table and you go clockwise, you reach East (right), then South (bottom), then West (left).

This bug was discovered during implementation and **deliberately not fixed immediately**. Instead, the test was written to assert the *current* (incorrect) behaviour:

```typescript
// __tests__/unit/playing.test.ts

it('returns next player in clockwise order', () => {
    // NOTE: this test documents current behaviour (N→S→E→W)
    // Correct Bridge order is N→E→S→W — this is a known bug
    expect(getNextPlayer('NORTH')).toBe('SOUTH');  // wrong but current
    expect(getNextPlayer('SOUTH')).toBe('EAST');
    expect(getNextPlayer('EAST')).toBe('WEST');
    expect(getNextPlayer('WEST')).toBe('NORTH');
});
```

**Why document the wrong behaviour in a test instead of fixing it?**

When you eventually fix the bug, this test will fail with a clear error message — "expected 'SOUTH' but got 'EAST'". That failure is exactly the signal you want: it confirms you changed this function and need to update all code that depends on player rotation order.

If the test didn't exist, you might fix `getNextPlayer` but miss a caller that was compensating for the wrong order. The failing test forces you to find and fix the complete set of changes needed.

This is called a **characterisation test** or **golden master test** — a test that documents current behaviour (even if wrong) so that any change is detected.

---

## Summary: DSA Concepts in Real Code

| Algorithm/Concept | Code Location | Real Use |
|---|---|---|
| Trie traversal | Next.js file router | URL → component resolution |
| Fisher-Yates shuffle | `shuffleDeck` | Unbiased O(N) deck randomisation |
| Hash map for ordering | `SUIT_ORDER`, `RANK_ORDER` | O(1) suit/rank comparison |
| Sliding window (size 3) | `isBiddingComplete` | Detect 3 consecutive passes |
| Reverse linear scan | `determineContract` | Find last bid in history |
| Forward linear scan | `determineContract` | Find first bid of suit |
| Linear max with comparator | `determineTrickWinner` | Multi-priority card comparison |
| Decomposition | `calculateScore` | Additive formula in components |
| Literal union types | `BidSuit`, `BidLevel`, etc. | Compile-time value set enforcement |
| Characterisation test | `getNextPlayer` tests | Bug detector for known wrong behavior |

---

**Next:** [Module 03 — Database Design with Prisma](./03-database-prisma.md)
