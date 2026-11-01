import { expect, test } from '@playwright/test';

const session = {
  access_token: 'e2e-access-token',
  refresh_token: 'e2e-refresh-token',
  expires_in: 3_600,
  expires_at: 4_102_444_800,
  token_type: 'bearer',
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'e2e-panel@example.test',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  },
};

// risk: #5 — the panel hides a failed request or cannot recover from it.
test('risk #5: an authenticated document-history failure is visible and retry recovers', async ({ page }) => {
  let documentRequests = 0;
  let sawAuthorizedDocumentRequest = false;

  await page.route('http://127.0.0.1:54321/auth/v1/token*', async (route) => {
    await route.fulfill({ json: { access_token: session.access_token, ...session } });
  });
  await page.route('http://127.0.0.1:8000/**', async (route) => {
    const request = route.request();

    if (new URL(request.url()).pathname === '/documents') {
      sawAuthorizedDocumentRequest ||= request.headers().authorization === `Bearer ${session.access_token}`;
      documentRequests += 1;
      await route.fulfill(documentRequests === 1
        ? { status: 500, json: { detail: 'synthetic failure' } }
        : { json: [] });
      return;
    }

    if (new URL(request.url()).pathname === '/office-rules') {
      await route.fulfill({ json: [] });
      return;
    }

    await route.abort();
  });

  await page.goto('/');
  await page.getByLabel('E-mail').fill(session.user.email);
  await page.getByLabel('Hasło', { exact: true }).fill('browser-smoke-password');
  await page.getByRole('button', { name: 'Zaloguj się' }).click();

  await expect(page.getByText('Nie udało się wykonać żądania. Spróbuj ponownie.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Spróbuj ponownie' }).click();
  await expect(page.getByText('Nie przesłano jeszcze dokumentów.')).toBeVisible();
  expect(documentRequests).toBe(2);
  expect(sawAuthorizedDocumentRequest).toBe(true);

  // No product data is created; auth and API are deterministic browser-smoke routes.
});
