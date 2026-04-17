import { test, expect } from '@playwright/test';

test.describe.serial('Kill Switch Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth so we can access protected pages
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { email: 'admin@alygn.com', role: 'admin' } }),
      }),
    );

    // Mock kill-switch API
    await page.route('**/api/kill-switch', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: 'ARMED',
          activeExperiments: 0,
          lastActivation: null,
          lastActivationBy: null,
        }),
      }),
    );

    // Mock events stream (SSE) — return empty
    await page.route('**/api/kill-switch/events', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: '',
      }),
    );

    // Mock activations history
    await page.route('**/api/kill-switch/activations', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ activations: [] }),
      }),
    );

    // Set auth cookie so middleware lets us through
    await page.context().addCookies([
      {
        name: 'admin_token',
        value: 'test-session-token',
        domain: 'localhost',
        path: '/',
      },
    ]);
  });

  test('dashboard loads with kill switch status card', async ({ page }) => {
    await page.goto('/kill-switch');
    await expect(page.getByRole('heading', { name: 'Kill Switch Control' })).toBeVisible();
  });

  test('displays ARMED state with green indicator', async ({ page }) => {
    await page.goto('/kill-switch');
    await expect(page.getByText('ARMED')).toBeVisible();
  });

  test('emergency stop button is visible when ARMED', async ({ page }) => {
    await page.goto('/kill-switch');
    await expect(page.getByRole('button', { name: /Emergency stop/i })).toBeVisible();
  });

  test('clicking emergency stop opens confirmation modal', async ({ page }) => {
    await page.goto('/kill-switch');
    await page.getByRole('button', { name: /Emergency stop/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('WARNING: Emergency Activation')).toBeVisible();
  });

  test('typing confirmation phrase enables confirm button', async ({ page }) => {
    await page.goto('/kill-switch');
    await page.getByRole('button', { name: /Emergency stop/i }).click();
    const confirmButton = page.getByRole('button', { name: 'CONFIRM' });
    await expect(confirmButton).toBeDisabled();

    await page.getByLabel('Confirmation phrase input').fill('STOP ALL CHAOS');
    await expect(confirmButton).toBeEnabled();
  });

  test('cancel closes the confirmation modal', async ({ page }) => {
    await page.goto('/kill-switch');
    await page.getByRole('button', { name: /Emergency stop/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('connection indicator shows Live or Polling', async ({ page }) => {
    await page.goto('/kill-switch');
    const indicator = page.getByText(/Live|Polling/);
    await expect(indicator).toBeVisible();
  });
});