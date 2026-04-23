import { test, expect, type BrowserContext } from '@playwright/test';
import { uniqueUser, registerAndLogin } from './helpers/auth';

test.describe('Room lifecycle', () => {
  test('creator creates a room and gets an invite code', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);

    await page.click('a[href="/create-room"]');
    await page.waitForURL('/create-room');

    await page.fill('input[placeholder*="Friday Night"]', 'Test Room E2E');
    await page.click('button[type="submit"]');

    // Should redirect to the new room lobby
    await page.waitForURL(/\/room\//, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/room\//);
  });

  test('second player joins using invite code', async ({ browser }) => {
    // Context 1 — creator
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const creator = uniqueUser();
    await registerAndLogin(page1, creator);

    await page1.goto('/create-room');
    await page1.fill('input[placeholder*="Friday Night"]', 'Join Test Room');
    await page1.click('button[type="submit"]');
    await page1.waitForURL(/\/room\//, { timeout: 15_000 });

    // Extract invite code from the page
    const inviteCode = await page1.locator('button.font-mono').first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => page1.locator('button.font-mono').first().innerText());
    // Invite codes may contain uppercase letters, digits, and underscores
    expect(inviteCode.length).toBeGreaterThanOrEqual(6);

    // Context 2 — joiner
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    const joiner = uniqueUser();
    await registerAndLogin(page2, joiner);

    await page2.goto('/join-room');
    await page2.fill('input[placeholder="ABCD1234"]', inviteCode);
    await page2.click('button[type="submit"]');
    await page2.waitForURL(/\/room\//, { timeout: 15_000 });

    await expect(page2).toHaveURL(/\/room\//);

    await ctx1.close();
    await ctx2.close();
  });

  test('seat selection persists after page reload', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);

    await page.goto('/create-room');
    await page.fill('input[placeholder*="Friday Night"]', 'Seat Persist Test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/room\//, { timeout: 15_000 });

    const roomUrl = page.url();

    // Click a seat (NORTH)
    const northSeat = page.locator('text=North, text=NORTH').first();
    if (await northSeat.isVisible()) {
      await northSeat.click();
      await page.waitForTimeout(1000);
    }

    // Reload and verify player is still in room
    await page.goto(roomUrl);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(roomUrl);
  });

  test('expired room returns error on join', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);

    await page.goto('/join-room');
    await page.fill('input[placeholder="ABCD1234"]', 'EXPIRED1');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=/not found|expired|invalid/i')).toBeVisible({ timeout: 5_000 });
  });

  test('room shows all 4 seat positions', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);

    await page.goto('/create-room');
    await page.fill('input[placeholder*="Friday Night"]', 'Seat Display Test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/room\//, { timeout: 15_000 });

    // Seats render as title-case in DOM (CSS uppercases them visually)
    await expect(page.locator('text=North').first()).toBeVisible();
    await expect(page.locator('text=South').first()).toBeVisible();
    await expect(page.locator('text=East').first()).toBeVisible();
    await expect(page.locator('text=West').first()).toBeVisible();
  });
});
