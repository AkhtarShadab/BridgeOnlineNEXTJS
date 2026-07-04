import { test, expect } from "@playwright/test";
import { createPlayers, startGame, getState, driveAuctionToContract, whoseTurn, cleanupPlayers } from "./helpers/game";

test.describe("Bidding phase", () => {
    test("full auction via API: 1♣ then 3 passes → contract reached", async ({ browser }) => {
        const players = await createPlayers(browser);
        const { gameId } = await startGame(players);

        // Drive auction via API (avoids UI timing issues)
        await driveAuctionToContract(players, gameId);

        // Reload host's page to pick up the new game state
        await players[0].page.reload({ waitUntil: 'networkidle' });

        // Verify contract chip is rendered on the table
        await expect(players[0].page.locator('[data-testid="felt-contract"]')).toBeVisible({ timeout: 10_000 });

        await cleanupPlayers(players);
    });

    test("too-low bid button is disabled", async ({ browser }) => {
        const players = await createPlayers(browser);
        const { gameId } = await startGame(players);

        // Make a 1♠ bid via API
        const opener = await whoseTurn(players, gameId);
        const bidOk = await opener.page.evaluate(async (gid: string) => {
            const r = await fetch(`/api/games/${gid}/bid`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'bid', bid: { level: 1, suit: 'S' } }),
            });
            return r.ok;
        }, gameId);
        expect(bidOk).toBe(true);

        // Next player's page — reload to pick up the new contract (1♠) from the
        // server, then the 1♣ bid button must be disabled (a club at level 1 is
        // lower than the standing 1♠ bid).
        const nextPlayer = await whoseTurn(players, gameId);
        await nextPlayer.page.reload({ waitUntil: 'networkidle' });
        await expect(nextPlayer.page.locator('[data-testid="bid-1-C"]')).toBeDisabled({ timeout: 10_000 });

        await cleanupPlayers(players);
    });
});
