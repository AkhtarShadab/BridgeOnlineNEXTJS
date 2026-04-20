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
  // Register
  await page.goto('/register');
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="username"]', user.username);
  await page.fill('input[name="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(login|dashboard)/, { timeout: 15_000 });

  // If redirected to login, sign in
  if (page.url().includes('/login')) {
    await page.fill('input[name="email"]', user.email);
    await page.fill('input[name="password"]', user.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard', { timeout: 15_000 });
  }
}

export async function login(page: Page, user: ReturnType<typeof uniqueUser>) {
  await page.goto('/login');
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard', { timeout: 15_000 });
}
