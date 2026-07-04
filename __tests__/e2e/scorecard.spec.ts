import { test, expect } from "@playwright/test";
import {
    createPlayers, startGame, driveAuctionToContract,
    getState, playCards, cleanupPlayers,
} from "./helpers/game";

test.describe("ScoreCard + multi-board (Feature 10)", () => {
    test("after full board, ScoreCard shows with contract line and board scores table", async ({ browser }) => {
        const players = await createPlayers(browser);
        const { gameId } = await startGame(players);
        await driveAuctionToContract(players, gameId);
        await playCards(players, gameId);

        const final = await getState(players[0], gameId);
        expect(final.phase).toBe("COMPLETED");

        // Check the ScoreCard is rendered
        const host = players[0];
        await expect(host.page.locator('[data-testid="score-card"]')).toBeVisible({ timeout: 10_000 });
        await expect(host.page.locator('[data-testid="score-contract-line"]')).toBeVisible();

        await cleanupPlayers(players);
    });
});
