import { defineConfig, devices } from '@playwright/test';

// Vite preview defaults to 4173. Override it locally when that port is occupied.
const PORT = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Use a deterministic local public configuration; each browser smoke intercepts only the requests it needs.
    command: `VITE_SUPABASE_URL='http://127.0.0.1:54321' VITE_SUPABASE_ANON_KEY='e2e-public-key' VITE_API_BASE='http://127.0.0.1:8000' npm run build && npm run preview -- --host 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
