import { test, expect } from "@playwright/test";
import { createPlayers, startGame, getState, cleanupPlayers } from "./helpers/game";

test.describe("Room → seat → start flow", () => {
    test("all 4 players see their assigned seats before start", async ({ browser }) => {
        const players = await createPlayers(browser);
        await startGame(players);

        for (const p of players) {
            // Verify each player is on the game page with BIDDING phase
            await expect(p.page).toHaveURL(/\/game\//);
            const state = await getState(p, p.page.url().split("/game/")[1]);
            expect(state.phase).toBe("BIDDING");
            expect(state.playerSeat).toBe(p.seat);
        }

        await cleanupPlayers(players);
    });

    test("starting with <4 ready players returns error", async ({ browser }) => {
        const players = await createPlayers(browser);
        const [host] = players;

        // Create room
        await host.page.goto("/create-room");
        await host.page.fill('input[placeholder*="Friday Night"]', "Fail Test");
        await host.page.click('button[type="submit"]');
        await host.page.waitForURL(/\/room\//, { timeout: 15_000 });
        const roomId = host.page.url().split("/room/")[1].split("?")[0];

        const res = await host.page.request.post(
            `/api/rooms/${roomId}/start`,
        );
        expect(res.ok()).toBeFalsy();
        expect(res.status()).toBe(400);

        await cleanupPlayers(players);
    });
});
