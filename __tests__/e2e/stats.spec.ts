import { test, expect } from "@playwright/test";
import {
    createPlayers,
    startGame,
    driveAuctionToContract,
    playBoardToCompletion,
    cleanupPlayers,
} from "./helpers/game";

/**
 * Feature 14: completing a board must credit the seated players' real stats,
 * and the dashboard must render them (Games Played + Win Rate).
 */
test.describe("Player stats (Feature 14)", () => {
    test("a completed board increments Games Played on the dashboard", async ({ browser }) => {
        test.setTimeout(180_000);

        const players = await createPlayers(browser);
        const { gameId } = await startGame(players);

        await driveAuctionToContract(players, gameId);
        await playBoardToCompletion(players, gameId);

        // Dashboard reads the signed-in user's stats server-side.
        await players[0].page.goto("/dashboard");

        const gamesPlayed = players[0].page.locator('[data-testid="games-played"]');
        await expect(gamesPlayed).toBeVisible();
        await expect(gamesPlayed).not.toHaveText("0");
        // exactly one board played
        await expect(gamesPlayed).toHaveText("1");

        // After exactly one board, Win Rate is fully determined: 0% (lost) or
        // 100% (won) — never the em dash, and never a fractional value.
        const winRate = players[0].page.locator('[data-testid="win-rate"]');
        await expect(winRate).toHaveText(/^(0|100)%$/);

        await cleanupPlayers(players);
    });
});
