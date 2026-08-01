/**
 * Mode-2 end-to-end (Feature 17/#14 + Feature 18/#15).
 *
 * Run via the dedicated config so the dev server boots with the Mode-2 kill
 * switches ON:
 *
 *   npx playwright test --config playwright.queue.config.ts queue.spec.ts
 *
 * What this proves (that Mode-1 e2e does NOT):
 *
 *   1. Queue path — bid/play routes ENQUEUE to BullMQ (`{ queued: true }`) and
 *      the Game Worker consumes the queue, driving a full board to COMPLETED.
 *   2. Idempotency — a duplicate `actionId` enqueues/apply exactly once
 *      (BullMQ jobId dedup + the worker's actionId guard).
 *   3. Hot/cold state — the hot copy lives in Redis (`game:{id}:state`) during
 *      play while Postgres keeps the last phase-transition snapshot; on
 *      COMPLETED the hot key is evicted and the final snapshot is flushed.
 *
 * Helpers here are poll-based: under the queue path, `POST /bid|/play` returns
 * `{ queued: true }` immediately — the state change happens asynchronously in
 * the worker. So we never assume the state moved right after a post; we poll
 * `getState` until the action is reflected. (The shared helpers in
 * helpers/game.ts call `whoseTurn` immediately after posting, which is correct
 * for inline Mode-1 but would race under Mode-2 — hence the local variants.)
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type RedisClientType } from "redis";
import { PrismaClient } from "@prisma/client";
import {
    createPlayers,
    startGame,
    getState,
    whoseTurn,
    cleanupPlayers,
    type Player,
} from "./helpers/game";

// ── direct infra inspection (test process → test Redis + test Postgres) ──────
let redis: RedisClientType;
let prisma: PrismaClient;
let players: Player[];

async function redisGet(gameId: string): Promise<any | null> {
    const raw = await redis.get(`game:${gameId}:state`);
    return raw ? JSON.parse(raw) : null;
}

async function pgGame(gameId: string) {
    return prisma.game.findUnique({
        where: { id: gameId },
        select: { phase: true, gameState: true, endedAt: true },
    });
}

function pickLegal(hand: string[], trick: { card: string }[]): string {
    if (trick.length === 0) return hand[0];
    const led = trick[0].card.slice(-1);
    const followers = hand.filter((c) => c.endsWith(led));
    return (followers.length ? followers : hand)[0];
}

/** Poll until `player` is no longer the current player (the worker advanced). */
async function waitForTurnAwayFrom(player: Player, gameId: string, timeout = 30_000) {
    await expect
        .poll(
            async () => {
                const s = await getState(player, gameId);
                return s.currentPlayer?.id !== player.userId;
            },
            { timeout, intervals: [200] },
        )
        .toBe(true);
}

/** Poll until `card` is gone from `player`'s hand (the worker applied the play). */
async function waitForCardRemoved(player: Player, gameId: string, card: string, timeout = 30_000) {
    await expect
        .poll(
            async () => {
                const s = await getState(player, gameId);
                return !s.hand.includes(card);
            },
            { timeout, intervals: [200] },
        )
        .toBe(true);
}

/** Opener bids 1♣ via the queue, next three pass → contract 1C, phase PLAYING. */
async function driveAuctionQueue(players: Player[], gameId: string) {
    const opener = await whoseTurn(players, gameId);
    const r1 = await opener.page.request.post(`/api/games/${gameId}/bid`, {
        data: { action: "bid", bid: { level: 1, suit: "C" } },
    });
    const b1 = await r1.json();
    expect(b1.queued).toBe(true); // ← queue path, not inline
    await waitForTurnAwayFrom(opener, gameId);

    for (let i = 0; i < 3; i++) {
        const p = await whoseTurn(players, gameId);
        const r = await p.page.request.post(`/api/games/${gameId}/bid`, {
            data: { action: "pass" },
        });
        const b = await r.json();
        expect(b.queued).toBe(true);
        // After the LAST pass the phase flips to PLAYING and currentPlayer
        // becomes the leader (≠ passer), so this still resolves.
        await waitForTurnAwayFrom(p, gameId);
    }

    await expect
        .poll(async () => (await getState(players[0], gameId)).phase, {
            timeout: 30_000,
            intervals: [300],
        })
        .toBe("PLAYING");
}

/** Play `n` cards through the queue, polling each until applied. */
async function playNCards(players: Player[], gameId: string, n: number) {
    for (let i = 0; i < n; i++) {
        const s0 = await getState(players[0], gameId);
        if (s0.phase === "COMPLETED") break;
        const p = await whoseTurn(players, gameId);
        const s = await getState(p, gameId);
        const card = pickLegal(s.hand, s.currentTrick);
        const r = await p.page.request.post(`/api/games/${gameId}/play`, {
            data: { card },
        });
        const b = await r.json();
        expect(b.queued).toBe(true); // ← queue path, not inline
        await waitForCardRemoved(p, gameId, card);
    }
}

test.beforeAll(async ({ browser }) => {
    if (!process.env.REDIS_URL) throw new Error("REDIS_URL must be set for Mode-2 e2e (see .env.test).");
    redis = createClient({ url: process.env.REDIS_URL }) as unknown as RedisClientType;
    await redis.connect();
    prisma = new PrismaClient();
    players = await createPlayers(browser);
    const { host: _h } = { host: players[0] }; void _h;
});

test.afterAll(async () => {
    if (players) await cleanupPlayers(players);
    if (redis) await redis.disconnect();
    if (prisma) await prisma.$disconnect();
});

// ── T1: full board through the BullMQ queue → COMPLETED ─────────────────────
test("full board through the queue reaches COMPLETED", async () => {
    const { gameId } = await startGame(players);

    await driveAuctionQueue(players, gameId);
    await playNCards(players, gameId, 52);

    // Final state via API…
    const finalState = await getState(players[0], gameId);
    expect(finalState.phase).toBe("COMPLETED");

    // …and the durable result row exists (proves the worker ran scoring).
    const result = await prisma.gameResult.findUnique({ where: { gameId } });
    expect(result).not.toBeNull();
    expect(result!.winningTeam).toMatch(/^(NS|EW)$/);

    // Postgres row agrees.
    const row = await pgGame(gameId);
    expect(row!.phase).toBe("COMPLETED");
    expect(row!.endedAt).not.toBeNull();
});

// ── T2: idempotency — duplicate actionId applies once ───────────────────────
test("duplicate actionId enqueues/applies exactly once", async () => {
    const { gameId } = await startGame(players);

    const opener = await whoseTurn(players, gameId);
    const dupActionId = crypto.randomUUID();

    // Send the SAME opener bid twice, as fast as possible.
    const payload = { action: "bid", bid: { level: 1, suit: "C" }, actionId: dupActionId };
    const [r1, r2] = await Promise.all([
        opener.page.request.post(`/api/games/${gameId}/bid`, { data: payload }),
        opener.page.request.post(`/api/games/${gameId}/bid`, { data: payload }),
    ]);
    const b1 = await r1.json();
    const b2 = await r2.json();
    // Both enqueues accepted (BullMQ dedups by jobId=actionId → one job).
    expect(b1.queued).toBe(true);
    expect(b2.queued).toBe(true);
    expect(b1.actionId).toBe(dupActionId);
    expect(b2.actionId).toBe(dupActionId);

    await waitForTurnAwayFrom(opener, gameId);

    // Drive the remaining 3 passes to reach a contract.
    for (let i = 0; i < 3; i++) {
        const p = await whoseTurn(players, gameId);
        const r = await p.page.request.post(`/api/games/${gameId}/bid`, {
            data: { action: "pass" },
        });
        expect((await r.json()).queued).toBe(true);
        await waitForTurnAwayFrom(p, gameId);
    }
    await expect
        .poll(async () => (await getState(players[0], gameId)).phase, { timeout: 30_000, intervals: [300] })
        .toBe("PLAYING");

    // Exactly one bidHistory entry carries the duplicated actionId.
    const state: any = await getState(players[0], gameId);
    const bidHistory: any[] = state.bidHistory ?? [];
    const withDup = bidHistory.filter((b) => b.actionId === dupActionId);
    expect(withDup.length).toBe(1);
    // Total auction = 1 bid + 3 passes.
    expect(bidHistory.length).toBe(4);
});

// ── T3: hot/cold state lifecycle ────────────────────────────────────────────
test("hot state in Redis during play, snapshot in Postgres on transitions, evicted on completion", async () => {
    const { gameId } = await startGame(players);
    const hotKey = `game:${gameId}:state`;

    await driveAuctionQueue(players, gameId);

    // Mid-PLAYING: play exactly one full trick (4 cards) so the live hot
    // state diverges from the BIDDING→PLAYING snapshot.
    await playNCards(players, gameId, 4);

    // Hot copy present in Redis…
    const hotMid = await redisGet(gameId);
    expect(hotMid, "Redis hot key should exist mid-game").not.toBeNull();
    // …and it already holds the completed trick (live)…
    expect(hotMid.tricks.length).toBe(1);

    // …while Postgres still holds the phase-transition snapshot (tricks=[])
    // — direct proof of hot/cold divergence during play.
    const pgMid = await pgGame(gameId);
    const pgMidState = pgMid!.gameState as any;
    expect(pgMidState.tricks.length).toBe(0);

    // Play the remaining 47 cards (51 total) through the queue. Pages stay on
    // /game/:id here — the key stays warm, which is exactly what we want mid-board.
    await playNCards(players, gameId, 47);

    // One card left (trick 13's 4th). Identify it via a final getState — this
    // is a Redis load against the warm key, so it does NOT re-warm.
    const pLast = await whoseTurn(players, gameId);
    const sLast = await getState(pLast, gameId);
    const lastCard = pickLegal(sLast.hand, sLast.currentTrick);

    // Navigate every page OFF /game/:id BEFORE the last play. The game page's
    // useEffect registers the `game:completed` → fetchGameState listener; once
    // unmounted, the completion socket event can no longer trigger a client
    // GET → RedisGameStateStore.load → re-warm of the hot key. Otherwise evict
    // runs in the worker but is immediately undone by the client refetch.
    for (const p of players) await p.page.goto("/");

    const r = await pLast.page.request.post(`/api/games/${gameId}/play`, {
        data: { card: lastCard },
    });
    expect((await r.json()).queued).toBe(true); // ← queue path on the final card too

    // Poll Postgres directly (NOT the API load) until COMPLETED, so we never
    // touch Redis ourselves.
    await expect
        .poll(async () => (await pgGame(gameId))?.phase, { timeout: 30_000, intervals: [300] })
        .toBe("COMPLETED");

    // No client is on /game/:id → no completed-refetch → the worker's `evict`
    // is observable: the hot key is gone.
    const hotLive = await redisGet(gameId);
    expect(hotLive, "Redis hot key should be evicted after COMPLETED").toBeNull();

    // …final snapshot flushed to Postgres on the completion transition (13 tricks)…
    const pgFinal = await pgGame(gameId);
    expect(pgFinal!.phase).toBe("COMPLETED");
    const pgFinalState = pgFinal!.gameState as any;
    expect(pgFinalState.tricks.length).toBe(13);

    // …and the durable result row exists.
    const result = await prisma.gameResult.findUnique({ where: { gameId } });
    expect(result).not.toBeNull();
});