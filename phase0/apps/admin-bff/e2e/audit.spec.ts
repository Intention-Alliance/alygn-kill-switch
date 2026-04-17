import { test, expect } from '@playwright/test';

test.describe('Audit Log', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { email: 'admin@alygn.com', role: 'admin' } }),
      }),
    );

    // Mock audit API — empty
    await page.route('**/api/audit/ollama**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ entries: [] }),
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

  test('audit page loads with heading and empty state', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.getByRole('heading', { name: 'Ollama Audit Log' })).toBeVisible();
    await expect(page.getByText('No Ollama requests logged yet')).toBeVisible();
  });

  test('model filter input is present and functional', async ({ page }) => {
    await page.goto('/audit');
    const filterInput = page.getByPlaceholder('Filter by model...');
    await expect(filterInput).toBeVisible();

    // Type a filter value — with empty data it shows "No entries matching filter"
    await filterInput.fill('llama3');
    await expect(page.getByText('No entries matching filter')).toBeVisible();
  });

  test('audit page shows data when entries exist', async ({ page }) => {
    // Override the mock for this test with real data
    await page.route('**/api/audit/ollama**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          entries: [
            {
              id: '1',
              created_at: new Date().toISOString(),
              model: 'llama3',
              method: 'POST',
              endpoint: '/api/chat',
              prompt_tokens: 100,
              completion_tokens: 50,
              client_ip: '127.0.0.1',
              status_code: 200,
              latency_ms: 500,
              error_message: null,
              kill_switch_state: 'ARMED',
            },
          ],
        }),
      }),
    );

    await page.goto('/audit');
    await expect(page.getByText('llama3')).toBeVisible();
    await expect(page.getByText('200')).toBeVisible();
  });
});