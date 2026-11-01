import { expect, test } from '@playwright/test';

// risk: #5 — panel hides a failed request or behaves differently across API configuration.
test('risk #5: invalid public API configuration is visible to the panel user', async ({ page }) => {
  // No test data is created, so this signed-out configuration-boundary scenario needs no cleanup.
  await page.goto('/');

  await expect(page.getByRole('alert')).toHaveText('Konfiguracja panelu jest nieprawidłowa.');
});
