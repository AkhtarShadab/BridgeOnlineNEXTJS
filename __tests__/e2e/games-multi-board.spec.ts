import { test, expect } from "@playwright/test";
import {
    createPlayers,
    startGame,
    driveAuctionToContract,
    playBoardToCompletion,
    getState,
    whoseTurn,
    cleanupPlayers,
} from "./helpers/game";

/**
 * Multi-game session: create a room configured for N boards ("Number of Games"),
 * play every board through to completion, and assert the final session result
 * (cumulative Session Results table with one row per board + end-of-session action).
 *
 * X is parameterised; the requested case is 3 games.
 */
const BOARDS = 3;

test.describe("Multi-game session (Number of Games)", () => {
    test(`plays ${BOARDS} boards through to a final session result`, async ({ browser }) => {
        test.setTimeout(240_000);

        const players = await createPlayers(browser);
        const { gameId } = await startGame(players, { boards: BOARDS });

        let currentGameId = gameId;

        for (let board = 1; board <= BOARDS; board++) {
            // Each leg starts on the correct board number in BIDDING.
            await expect
                .poll(async () => (await getState(players[0], currentGameId)).boardNumber)
                .toBe(board);
            expect((await getState(players[0], currentGameId)).phase).toBe("BIDDING");

            await driveAuctionToContract(players, currentGameId);

            // Claim-check: once play begins, the turn indicator must read "play",
            // not "bid". Verify on the first board for the on-turn (opening lead) player.
            if (board === 1) {
                const onTurn = await whoseTurn(players, currentGameId);
                await onTurn.page.goto(`/game/${currentGameId}`);
                const ring = onTurn.page.locator('[data-testid="turn-ring"]');
                await expect(ring).toContainText(/play/i);
                await expect(ring).not.toContainText(/bid/i);
            }

            // playBoardToCompletion returns only once the server reports the board
            // complete (gameComplete=true). Note: when the next board starts, every
            // GamePlayer row is re-pointed at the new game, so the just-finished
            // intermediate board is no longer fetchable via GET (returns 403). We
            // therefore assert progress against the *new* board, not the old id.
            const nextGameId = await playBoardToCompletion(players, currentGameId);

            if (board < BOARDS) {
                // More boards to come: server hands back the next game id in BIDDING.
                expect(nextGameId).toBeTruthy();
                currentGameId = nextGameId as string;
                await expect
                    .poll(async () => (await getState(players[0], currentGameId)).phase)
                    .toBe("BIDDING");
            } else {
                // Final board: no further game; this board stays fetchable/COMPLETED.
                expect(nextGameId).toBeNull();
                await expect
                    .poll(async () => (await getState(players[0], currentGameId)).phase)
                    .toBe("COMPLETED");
            }
        }

        // Final session result on the last completed board.
        await players[0].page.goto(`/game/${currentGameId}`);
        await expect(players[0].page.locator('[data-testid="score-card"]')).toBeVisible({
            timeout: 15_000,
        });

        // Session Results table: exactly one row per board played.
        const rows = players[0].page.locator('[data-testid="board-scores-table"] tbody tr');
        await expect(rows).toHaveCount(BOARDS);

        // End of session → "Back to Dashboard", not a next-board countdown.
        await expect(players[0].page.locator('[data-testid="back-to-dashboard"]')).toBeVisible();
        await expect(players[0].page.locator('[data-testid="next-board-countdown"]')).toHaveCount(0);

        await cleanupPlayers(players);
    });
});
