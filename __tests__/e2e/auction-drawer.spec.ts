import { test, expect } from "@playwright/test";
import {
    createPlayers, startGame, driveAuctionToContract,
    getState, cleanupPlayers,
} from "./helpers/game";

test.describe("AuctionDrawer collapsed/expanded (Feature 11)", () => {
    test("during PLAYING, auction is collapsed; expands on toggle click", async ({ browser }) => {
        const players = await createPlayers(browser);
        const { gameId } = await startGame(players);
        await driveAuctionToContract(players, gameId);

        const host = players[0];
        const drawer = host.page.locator('[data-testid="auction-drawer"]');
        await expect(drawer).toBeVisible();

        // Collapsed by default — bid table should NOT be visible
        const bidTable = host.page.locator('[data-testid="bid-table"]');
        await expect(bidTable).not.toBeVisible();

        // Click toggle to expand
        await host.page.locator('[data-testid="auction-drawer-toggle"]').click();
        await expect(bidTable).toBeVisible();

        // Click again to collapse
        await host.page.locator('[data-testid="auction-drawer-toggle"]').click();
        await expect(bidTable).not.toBeVisible();

        await cleanupPlayers(players);
    });
});
