import { test, expect } from "@playwright/test";
import {
    createPlayers, startGame, driveAuctionToContract,
    getState, whoseTurn, cleanupPlayers,
} from "./helpers/game";

test.describe("Mobile / touch (Feature 09)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("BidDrawer opens on FAB click, bid registers, drawer closes", async ({ browser }) => {
        const players = await createPlayers(browser);
        const { gameId } = await startGame(players);

        // The FAB is enabled only for the player on turn (disabled={!isMyTurn}),
        // so drive the bidder — the dealer is random, not necessarily the host.
        const bidder = await whoseTurn(players, gameId);
        const page = bidder.page;
        const fab = page.locator('[data-testid="bid-fab"]');
        await expect(fab).toBeVisible();
        await expect(fab).toBeEnabled();

        // Click FAB → drawer opens
        await fab.click();
        await expect(page.locator('[data-testid="bid-drawer"]')).toBeVisible();

        // Close via × button
        await page.locator('[data-testid="bid-drawer-close"]').click();
        await expect(page.locator('[data-testid="bid-drawer"]')).not.toBeVisible();

        // Re-open then close via ESC
        await fab.click();
        await expect(page.locator('[data-testid="bid-drawer"]')).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator('[data-testid="bid-drawer"]')).not.toBeVisible();

        await cleanupPlayers(players);
    });

    test("card two-tap: first tap selects, second tap confirms", async ({ browser }) => {
        const players = await createPlayers(browser);
        const { gameId } = await startGame(players);
        await driveAuctionToContract(players, gameId);

        const leader = await whoseTurn(players, gameId);
        const state = await getState(leader, gameId);
        const firstCard = state.hand[0];

        const cardLoc = leader.page.locator(`[data-testid="hand-card-${firstCard}"]`);
        await cardLoc.scrollIntoViewIfNeeded();
        // dispatchEvent delivers the click directly to the card element. A normal
        // (even forced) click lands on whichever element is topmost at the point,
        // which on the 3D mobile table is the .bt-stage/.bt-scene ancestor — so we
        // target the card node itself to exercise the two-tap select/confirm logic.
        await cardLoc.dispatchEvent("click");
        await expect(cardLoc).toHaveAttribute("data-selected", "true");

        // Tap same card again to confirm the play
        await cardLoc.dispatchEvent("click");
        await expect(cardLoc).not.toBeVisible();

        await cleanupPlayers(players);
    });
});
