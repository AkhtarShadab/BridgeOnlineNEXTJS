import { test, expect } from "@playwright/test";
import {
    createPlayers, startGame, driveAuctionToContract,
    getState, whoseTurn, cleanupPlayers,
} from "./helpers/game";

test.describe("Hint button UI (Feature 12)", () => {
    test("hint button is enabled on current player's turn, disabled for others", async ({ browser }) => {
        const players = await createPlayers(browser);
        const { gameId } = await startGame(players);

        const onTurn = await whoseTurn(players, gameId);
        const offTurn = players.find((p) => p.userId !== onTurn.userId)!;

        // The on-turn player's hint button should be enabled
        await expect(onTurn.page.locator('[data-testid="hint-button"]')).toBeEnabled();

        // An off-turn player's hint button should be disabled
        await expect(offTurn.page.locator('[data-testid="hint-button"]')).toBeDisabled();

        await cleanupPlayers(players);
    });

    test("hint button click shows error toast (AI backend not implemented)", async ({ browser }) => {
        const players = await createPlayers(browser);
        const { gameId } = await startGame(players);

        const onTurn = await whoseTurn(players, gameId);
        await onTurn.page.locator('[data-testid="hint-button"]').click();

        // Expect error since the AI route returns 501 (not implemented)
        await expect(onTurn.page.locator('[data-testid="hint-error"]')).toBeVisible({ timeout: 15_000 });

        await cleanupPlayers(players);
    });
});
