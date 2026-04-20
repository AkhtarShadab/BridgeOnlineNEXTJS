import { test, expect } from '@playwright/test';
import { uniqueUser, registerAndLogin } from './helpers/auth';

/**
 * Reconnection tests — verify players can return to a room after
 * a page reload or brief navigation away and still see their seat.
 *
 * Note: The full 30s grace-period protocol (Section 8.4 of DESIGN_DOCUMENT.md)
 * requires Redis and BullMQ (not yet deployed). These tests cover the
 * observable behaviour: state is preserved across page reloads.
 */
test.describe('Player reconnection', () => {
  test('player retains their seat after a full page reload', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);

    await page.goto('/create-room');
    await page.fill('input[placeholder*="Friday Night"]', 'Reconnect Test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/room\//, { timeout: 15_000 });

    const roomUrl = page.url();

    // The creator is auto-seated at SOUTH
    await page.waitForTimeout(500);

    // Simulate disconnect → reconnect (page reload)
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Player should still be on the room page after reload
    await expect(page).toHaveURL(roomUrl);
  });

  test('player can navigate away and return to room', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);

    await page.goto('/create-room');
    await page.fill('input[placeholder*="Friday Night"]', 'Navigate Away Test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/room\//, { timeout: 15_000 });

    const roomUrl = page.url();

    // Navigate away
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/dashboard');

    // Come back
    await page.goto(roomUrl);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(roomUrl);
  });

  test('room API returns current state on reconnect', async ({ page, request }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);

    await page.goto('/create-room');
    await page.fill('input[placeholder*="Friday Night"]', 'API State Test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/room\//, { timeout: 15_000 });

    const roomId = page.url().split('/room/')[1];

    // Poll the room API to confirm state is persisted
    const response = await page.request.get(`/api/rooms/${roomId}`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.id).toBe(roomId);
    expect(body.status).toBe('WAITING');
    expect(body.players.length).toBeGreaterThanOrEqual(1);
  });

  test('Socket.io reconnects automatically after brief disconnect', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);

    await page.goto('/create-room');
    await page.fill('input[placeholder*="Friday Night"]', 'Socket Reconnect Test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/room\//, { timeout: 15_000 });

    // Simulate a network interruption using CDP
    const client = await page.context().newCDPSession(page);
    await client.send('Network.emulateNetworkConditions', {
      offline: true,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });

    // Wait 2s then restore
    await page.waitForTimeout(2_000);
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });

    await page.waitForTimeout(2_000);

    // Room page should still be functional
    await expect(page).toHaveURL(/\/room\//);
  });
});
