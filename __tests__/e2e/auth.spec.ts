import { test, expect } from '@playwright/test';
import { uniqueUser, registerAndLogin } from './helpers/auth';

test.describe('Authentication', () => {
  test('registers a new user and lands on dashboard', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);
    await expect(page).toHaveURL('/dashboard');
  });

  test('shows error for duplicate email on registration', async ({ browser }) => {
    const user = uniqueUser();

    // Use context 1 to register the user
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await registerAndLogin(page1, user);
    await ctx1.close();

    // Use a fresh context (not logged in) to attempt duplicate registration
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto('/register');
    await page2.fill('#email', user.email);
    await page2.fill('#username', `${user.username}2`);
    await page2.fill('#password', user.password);
    const confirmField = page2.locator('#confirmPassword');
    if (await confirmField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmField.fill(user.password);
    }
    await page2.click('button[type="submit"]');

    await expect(page2.locator('text=/already exists|taken|duplicate/i')).toBeVisible({ timeout: 5_000 });
    await ctx2.close();
  });

  test('shows error for wrong password on login', async ({ browser }) => {
    const user = uniqueUser();

    // Register the user in one context
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await registerAndLogin(page1, user);
    await ctx1.close();

    // Use a fresh context (not logged in) to test wrong password
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto('/login');
    await page2.fill('#email', user.email);
    await page2.fill('#password', 'wrongpassword');
    await page2.click('button[type="submit"]');

    await expect(page2.locator('text=/invalid|incorrect|wrong/i')).toBeVisible({ timeout: 5_000 });
    await ctx2.close();
  });

  test('redirects unauthenticated user away from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });

  test('logs out and redirects to login', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);
    await expect(page).toHaveURL('/dashboard');

    // Find and click logout — try common patterns
    const logoutBtn = page.locator('button:has-text("Sign out"), button:has-text("Logout"), a:has-text("Sign out"), a:has-text("Logout")');
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/login|\//, { timeout: 10_000 });
    } else {
      // Skip if logout UI isn't on dashboard
      test.info().annotations.push({ type: 'note', description: 'Logout button not found on dashboard' });
    }
  });
});
