import {
    type Browser,
    type BrowserContext,
    expect,
} from "@playwright/test";
import { uniqueUser, registerAndLogin } from "./auth";

export type Seat = "NORTH" | "EAST" | "SOUTH" | "WEST";
export const SEATS: Seat[] = ["NORTH", "EAST", "SOUTH", "WEST"];

export interface Player {
    ctx: BrowserContext;
    page: Page;
    user: ReturnType<typeof uniqueUser>;
    seat?: Seat;
    userId?: string;
}

export interface GameState {
    gameId: string;
    phase: "BIDDING" | "PLAYING" | "COMPLETED";
    boardNumber: number;
    currentPlayer: { id: string } | null;
    playerSeat: Seat;
    hand: string[];
    currentTrick: { seat: Seat; card: string }[];
    contract: { level: number; suit: string } | null;
    tricksWon: { NS: number; EW: number };
    players: { userId: string; seat: Seat; username: string }[];
}

/** Register+login 4 isolated players, each in their own context. */
export async function createPlayers(browser: Browser): Promise<Player[]> {
    const players: Player[] = [];
    for (let i = 0; i < 4; i++) {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const user = uniqueUser();
        await registerAndLogin(page, user);
        players.push({ ctx, page, user });
    }
    return players;
}

/** Create room → join → seat → ready → start. Returns roomId + gameId.
 *  Pass `{ boards }` to configure a multi-board session (Number of Games). */
export async function startGame(
    players: Player[],
    opts: { boards?: number } = {},
): Promise<{ roomId: string; gameId: string }> {
    const [host, ...rest] = players;

    // Host creates room (UI — exercises the create form once)
    await host.page.goto("/create-room");
    await host.page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await host.page.fill('input[placeholder*="Friday Night"]', "E2E Game");
    if (opts.boards && opts.boards > 1) {
        await host.page.fill('[data-testid="num-games"]', String(opts.boards));
    }
    await host.page.click('button[type="submit"]');
    await host.page.waitForURL(/\/room\//, { timeout: 30_000 });
    const roomUrl = host.page.url();
    const roomId = roomUrl.split("/room/")[1].split("?")[0];

    const inviteCode = await host.page
        .locator("button.font-mono")
        .first()
        .innerText();

    // Others join (UI)
    for (const p of rest) {
        await p.page.goto("/join-room");
        await p.page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
        await p.page.fill('input[placeholder="ABCD1234"]', inviteCode);
        await p.page.click('button[type="submit"]');
        await p.page.waitForURL(/\/room\//, { timeout: 30_000 });
    }

    // Seats are auto-assigned by the join route (NORTH→EAST→WEST).
    // The host keeps auto-assigned SOUTH. Read actual seats from the API.
    const roomResp = await host.page.request.get(`/api/rooms/${roomId}`);
    const roomData = await roomResp.json();
    for (const p of players) {
        const match = roomData.players.find((pl: any) => pl.username === p.user.username);
        if (match) {
            p.seat = match.seat;
            p.userId = match.userId;
        }
    }

    // Ready via API
    for (const p of players) {
        const readyResp = await p.page.request.patch(`/api/rooms/${roomId}/ready`, {
            data: { isReady: true },
        });
        expect(readyResp.ok()).toBeTruthy();
    }

    // Host starts the game
    const startResp = await host.page.request.post(`/api/rooms/${roomId}/start`);
    expect(startResp.ok()).toBeTruthy();
    const startData = await startResp.json();
    const gameId = startData.gameId;

    // Land every player on the game page
    // Land every player on the game page
    for (const p of players) {
        await p.page.goto(`/game/${gameId}`);
        await p.page.waitForSelector('h1:has-text("Bridge Game")', { timeout: 60_000 }).catch(() => {});
    }

    const state = await getState(players[0], gameId);
    for (const player of players) {
        const seat = player.seat!;
        const match = state.players.find(
            (ps: any) => ps.seat === seat,
        );
        if (match) player.userId = match.userId;
    }

    return { roomId, gameId };
}

/** Fetch current game state via GET /api/games/:id. */
export async function getState(
    p: Player,
    gameId: string,
): Promise<GameState> {
    const resp = await p.page.request.get(`/api/games/${gameId}`);
    expect(resp.ok()).toBeTruthy();
    return resp.json();
}

/** Find which Player's turn it is. */
export async function whoseTurn(
    players: Player[],
    gameId: string,
): Promise<Player> {
    const s = await getState(players[0], gameId);
    const turnId = s.currentPlayer?.id;
    const p = players.find((pl) => pl.userId === turnId);
    if (p) return p;
    // Fallback: scan each player's state
    for (const pl of players) {
        const st = await getState(pl, gameId);
        if (st.currentPlayer?.id === pl.userId) return pl;
    }
    throw new Error("Could not determine whose turn it is");
}

/** Opener bids 1♣, next three pass → contract 1C. Leaves phase=PLAYING. */
export async function driveAuctionToContract(
    players: Player[],
    gameId: string,
) {
    const opener = await whoseTurn(players, gameId);
    let resp = await opener.page.request.post(`/api/games/${gameId}/bid`, {
        data: { action: 'bid', bid: { level: 1, suit: 'C' } },
    });
    expect(resp.ok()).toBeTruthy();

    for (let i = 0; i < 3; i++) {
        const p = await whoseTurn(players, gameId);
        resp = await p.page.request.post(`/api/games/${gameId}/bid`, {
            data: { action: 'pass' },
        });
        expect(resp.ok()).toBeTruthy();
    }

    // Wait for phase to flip to PLAYING
    await expect
        .poll(async () => (await getState(players[0], gameId)).phase, {
            timeout: 30_000,
            intervals: [500],
        })
        .toBe("PLAYING");
}

/** Pick a legal card from hand: follow led suit if able, else anything. */
function pickLegal(hand: string[], trick: { card: string }[]): string {
    if (trick.length === 0) return hand[0];
    const ledSuit = trick[0].card.slice(-1);
    const followers = hand.filter((c) => c.endsWith(ledSuit));
    return (followers.length ? followers : hand)[0];
}

/** Play `count` cards (default 52 = full board) via API with legal computation. */
export async function playCards(
    players: Player[],
    gameId: string,
    count = 52,
) {
    for (let i = 0; i < count; i++) {
        const s0 = await getState(players[0], gameId);
        if (s0.phase === "COMPLETED") break;
        const p = await whoseTurn(players, gameId);
        const s = await getState(p, gameId);
        const card = pickLegal(s.hand, s.currentTrick);
        const resp = await p.page.request.post(`/api/games/${gameId}/play`, {
            data: { card },
        });
        expect(resp.ok()).toBeTruthy();
    }
}

/**
 * Play the current board through to COMPLETED, returning the nextGameId the
 * server hands back on the final card (null when it was the last board).
 * Captures the play response so multi-board sessions can advance deterministically.
 */
export async function playBoardToCompletion(
    players: Player[],
    gameId: string,
): Promise<string | null> {
    for (let i = 0; i < 52; i++) {
        const s0 = await getState(players[0], gameId);
        if (s0.phase === "COMPLETED") break;
        const p = await whoseTurn(players, gameId);
        const s = await getState(p, gameId);
        const card = pickLegal(s.hand, s.currentTrick);
        const resp = await p.page.request.post(`/api/games/${gameId}/play`, {
            data: { card },
        });
        expect(resp.ok()).toBeTruthy();
        const body = await resp.json();
        if (body?.gameComplete) {
            return body.nextGameId ?? null;
        }
    }
    return null;
}

/** Cleanup: close all player contexts. */
export async function cleanupPlayers(players: Player[]) {
    await Promise.all(players.map((p) => p.ctx.close()));
}
