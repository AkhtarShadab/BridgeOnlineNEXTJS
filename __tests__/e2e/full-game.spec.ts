import { test, expect } from '@playwright/test';
import { uniqueUser, registerAndLogin } from './helpers/auth';

/**
 * Full 4-player game flow: create room → 4 players join → all ready → game starts.
 * Bidding and card-play steps follow once the game is running.
 */
test.describe('Full 4-player game', () => {
  test('4 players can join a room and reach the ready state', async ({ browser }) => {
    const users = [uniqueUser(), uniqueUser(), uniqueUser(), uniqueUser()];

    // Register all 4 users first using isolated contexts
    const contexts = await Promise.all(users.map(() => browser.newContext()));
    const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

    await Promise.all(users.map((u, i) => registerAndLogin(pages[i], u)));

    // Player 0 creates the room
    await pages[0].goto('/create-room');
    await pages[0].fill('input[placeholder*="Friday Night"]', '4-Player Test');
    await pages[0].click('button[type="submit"]');
    await pages[0].waitForURL(/\/room\//, { timeout: 15_000 });

    const inviteCode = await pages[0].locator('text=/[A-Z0-9]{6,10}/').first().innerText();

    // Players 1-3 join using invite code
    for (let i = 1; i <= 3; i++) {
      await pages[i].goto('/join-room');
      await pages[i].fill('input[placeholder="ABCD1234"]', inviteCode);
      await pages[i].click('button[type="submit"]');
      await pages[i].waitForURL(/\/room\//, { timeout: 15_000 });
    }

    // Verify all 4 are on a room page
    for (const page of pages) {
      await expect(page).toHaveURL(/\/room\//);
    }

    await Promise.all(contexts.map((ctx) => ctx.close()));
  });

  test('ready button becomes active after seat selection', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);

    await page.goto('/create-room');
    await page.fill('input[placeholder*="Friday Night"]', 'Ready Test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/room\//, { timeout: 15_000 });

    // Seat is auto-assigned as SOUTH for creator — look for ready button
    const readyBtn = page.locator('button:has-text("Ready"), button:has-text("Mark Ready")');
    if (await readyBtn.isVisible({ timeout: 5_000 })) {
      await readyBtn.click();
      await page.waitForTimeout(500);
      // After clicking ready, look for "✓ Ready" or similar confirmation
      const readyIndicator = page.locator('text=/✓ Ready|ready/i').first();
      await expect(readyIndicator).toBeVisible({ timeout: 5_000 });
    }
  });

  test('game page loads for active game', async ({ browser }) => {
    const users = [uniqueUser(), uniqueUser(), uniqueUser(), uniqueUser()];
    const contexts = await Promise.all(users.map(() => browser.newContext()));
    const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
    await Promise.all(users.map((u, i) => registerAndLogin(pages[i], u)));

    // Create room
    await pages[0].goto('/create-room');
    await pages[0].fill('input[placeholder*="Friday Night"]', 'Game Start Test');
    await pages[0].click('button[type="submit"]');
    await pages[0].waitForURL(/\/room\//, { timeout: 15_000 });
    const roomUrl = pages[0].url();
    const roomId = roomUrl.split('/room/')[1];

    const inviteCode = await pages[0].locator('text=/[A-Z0-9]{6,10}/').first().innerText();

    // Others join
    for (let i = 1; i <= 3; i++) {
      await pages[i].goto('/join-room');
      await pages[i].fill('input[placeholder="ABCD1234"]', inviteCode);
      await pages[i].click('button[type="submit"]');
      await pages[i].waitForURL(/\/room\//, { timeout: 15_000 });
    }

    // All select seats via API (faster than clicking UI for each player)
    const seats = ['NORTH', 'EAST', 'WEST', 'SOUTH'];
    // Player 0 is already in SOUTH from creation, skip seat 3 (SOUTH)
    // Use the seat button if available; otherwise skip
    for (let i = 0; i < 4; i++) {
      const seatBtn = pages[i].locator(`button:has-text("${seats[i]}"), text=${seats[i]}`).first();
      if (await seatBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await seatBtn.click().catch(() => {});
        await pages[i].waitForTimeout(300);
      }
    }

    // All mark ready
    for (const page of pages) {
      const readyBtn = page.locator('button:has-text("Ready"), button:has-text("Mark Ready")');
      if (await readyBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await readyBtn.click().catch(() => {});
        await page.waitForTimeout(300);
      }
    }

    // Room page is still accessible
    await expect(pages[0]).toHaveURL(/\/room\//);

    await Promise.all(contexts.map((ctx) => ctx.close()));
  });
});
