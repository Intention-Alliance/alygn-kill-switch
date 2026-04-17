import { test, expect } from '@playwright/test';

test.describe('Error Boundaries', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { email: 'admin@alygn.com', role: 'admin' } }),
      }),
    );

    // Set auth cookie
    await page.context().addCookies([
      {
        name: 'admin_token',
        value: 'test-session-token',
        domain: 'localhost',
        path: '/',
      },
    ]);
  });

  test('network error shows error UI instead of white screen', async ({ page }) => {
    // Mock kill-switch API to return 500
    await page.route('**/api/kill-switch', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error' }),
      }),
    );

    // Mock events and activations
    await page.route('**/api/kill-switch/events', (route) =>
      route.fulfill({ status: 500, body: 'Server Error' }),
    );
    await page.route('**/api/kill-switch/activations', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ activations: [] }),
      }),
    );

    await page.goto('/kill-switch');

    // The page should still render — either with error UI or the connection lost indicator
    // We should NOT get a blank white screen
    const errorUI = page.getByText(/Something went wrong|Connection lost|Kill Switch Error/i);
    await expect(errorUI).toBeVisible({ timeout: 15_000 });
  });

  test('retry button recovers from error', async ({ page }) => {
    let callCount = 0;

    // First call fails, second succeeds
    await page.route('**/api/kill-switch', (route) => {
      callCount++;
      if (callCount === 1) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal Server Error' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: 'ARMED',
          activeExperiments: 0,
          lastActivation: null,
          lastActivationBy: null,
        }),
      });
    });

    await page.route('**/api/kill-switch/events', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }),
    );
    await page.route('**/api/kill-switch/activations', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ activations: [] }),
      }),
    );

    await page.goto('/kill-switch');

    // Wait for error state to appear
    const retryButton = page.getByRole('button', { name: /Try Again|Retry/i });
    await expect(retryButton).toBeVisible({ timeout: 15_000 });

    // Click retry — next API call will succeed
    await retryButton.click();

    // Page should recover and show the kill switch dashboard
    await expect(page.getByText('ARMED')).toBeVisible({ timeout: 10_000 });
  });
});