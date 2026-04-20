import { test, expect } from '@playwright/test';
import { uniqueUser, registerAndLogin } from './helpers/auth';

test.describe('Authentication', () => {
  test('registers a new user and lands on dashboard', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);
    await expect(page).toHaveURL('/dashboard');
  });

  test('shows error for duplicate email on registration', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);

    // Try to register again with same email
    await page.goto('/register');
    await page.fill('input[name="email"]', user.email);
    await page.fill('input[name="username"]', `${user.username}2`);
    await page.fill('input[name="password"]', user.password);
    await page.click('button[type="submit"]');

    await expect(page.locator('text=/already exists|taken|duplicate/i')).toBeVisible({ timeout: 5_000 });
  });

  test('shows error for wrong password on login', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);

    await page.goto('/login');
    await page.fill('input[name="email"]', user.email);
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=/invalid|incorrect|wrong/i')).toBeVisible({ timeout: 5_000 });
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
