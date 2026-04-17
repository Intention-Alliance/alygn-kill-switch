import { test, expect } from '@playwright/test';
import { login, logout } from './helpers/auth';

test.describe('Login Flow', () => {
  test('login page loads with form visible', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Invalid credentials')).toBeVisible();
  });

  test('login with valid credentials redirects to /kill-switch', async ({ page }) => {
    const email = process.env.ADMIN_EMAIL || 'admin@alygn.com';
    const password = process.env.KILL_SWITCH_AUTH_TOKEN;
    if (!password) {
      test.skip();
      return;
    }

    // Mock the /api/auth/me check so we don't get redirected mid-flow
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: 401, body: JSON.stringify({ message: 'No session' }) }),
    );

    await login(page, email, password);
    await expect(page).toHaveURL(/\/kill-switch/);
  });

  test('unauthenticated access redirects to /login', async ({ page }) => {
    await page.goto('/kill-switch');
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout redirects to /login', async ({ page }) => {
    const password = process.env.KILL_SWITCH_AUTH_TOKEN;
    if (!password) {
      test.skip();
      return;
    }

    const email = process.env.ADMIN_EMAIL || 'admin@alygn.com';

    // Mock auth/me to simulate authenticated state after login
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { email, role: 'admin' },
        }),
      }),
    );

    // Mock login API
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { email, role: 'admin' } }),
        headers: { 'Set-Cookie': 'admin_token=test-session; Path=/' },
      }),
    );

    await login(page, email, password);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });
});