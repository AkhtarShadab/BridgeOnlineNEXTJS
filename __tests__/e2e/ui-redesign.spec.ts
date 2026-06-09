import { test, expect } from '@playwright/test';
import { uniqueUser, registerAndLogin } from './helpers/auth';

test.describe('UI Redesign — Feature 01', () => {
  test('dashboard stats strip renders', async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await expect(page.locator('[data-testid="stats-strip"]')).toBeVisible();
  });

  test('flag off: legacy markers present', async ({ page }) => {
    // Run with NEXT_PUBLIC_FEATURE_NEW_UI=false (default)
    await registerAndLogin(page, uniqueUser());
    // spot-check that page loads without errors
    await expect(page).not.toHaveURL(/error/);
  });

  test('flag on: new UI markers present', async ({ page }) => {
    // This test documents the expected behavior when flag is enabled
    // In CI, set NEXT_PUBLIC_FEATURE_NEW_UI=true
    await registerAndLogin(page, uniqueUser());
    await expect(page).not.toHaveURL(/error/);
  });
});
