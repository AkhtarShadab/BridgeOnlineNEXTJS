import { test, expect } from "@playwright/test";
import {
    createPlayers, startGame, driveAuctionToContract,
    getState, whoseTurn, playCards, cleanupPlayers,
} from "./helpers/game";

test.describe("Playing phase", () => {
    test("play a trick via UI: tap to select, tap to confirm", async ({ browser }) => {
        const players = await createPlayers(browser);
        const { gameId } = await startGame(players);
        await driveAuctionToContract(players, gameId);

        const leader = await whoseTurn(players, gameId);
        const state = await getState(leader, gameId);
        const firstCard = state.hand[0];

        // Two-tap: first tap selects, second confirms
        const cardLocator = leader.page.locator(`[data-testid="hand-card-${firstCard}"]`);
        await expect(cardLocator).toBeVisible({ timeout: 10_000 });
        await cardLocator.click();
        await expect(cardLocator).toHaveAttribute("data-selected", "true");

        await cardLocator.click();
        await expect(cardLocator).not.toBeVisible();

        await cleanupPlayers(players);
    });

    test("full board plays through via API to COMPLETED", async ({ browser }) => {
        const players = await createPlayers(browser);
        const { gameId } = await startGame(players);
        await driveAuctionToContract(players, gameId);

        // Play all 52 cards via API (the legal-move helper)
        await playCards(players, gameId);

        // Phase should be COMPLETED
        const final = await getState(players[0], gameId);
        expect(final.phase).toBe("COMPLETED");

        await cleanupPlayers(players);
    });
});
