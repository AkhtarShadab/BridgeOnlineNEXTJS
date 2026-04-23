import { type Page } from '@playwright/test';

let counter = 0;

export function uniqueUser() {
  const ts = Date.now();
  const n = ++counter;
  return {
    email: `e2e-${ts}-${n}@test.com`,
    username: `e2e_${ts}_${n}`,
    password: 'Password123!',
  };
}

export async function registerAndLogin(page: Page, user: ReturnType<typeof uniqueUser>) {
  // Register — inputs use id attributes (not name) in the Next.js register page
  await page.goto('/register');
  await page.fill('#email', user.email);
  await page.fill('#username', user.username);
  await page.fill('#password', user.password);
  // confirmPassword field exists — fill it too
  const confirmField = page.locator('#confirmPassword');
  if (await confirmField.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await confirmField.fill(user.password);
  }
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(login|dashboard)/, { timeout: 15_000 });

  // If redirected to login, sign in
  if (page.url().includes('/login')) {
    await page.fill('#email', user.email);
    await page.fill('#password', user.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard', { timeout: 15_000 });
  }
}

export async function login(page: Page, user: ReturnType<typeof uniqueUser>) {
  await page.goto('/login');
  await page.fill('#email', user.email);
  await page.fill('#password', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard', { timeout: 15_000 });
}
