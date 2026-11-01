# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.64.1
- config: frontend/playwright.config.ts
- single-spec command: cd frontend && npx playwright test tests/e2e/seed.spec.ts
- full-suite command: cd frontend && npx playwright test
- base URL: http://127.0.0.1:4173
- port: 4173 (detected from Vite preview default; override with E2E_PORT)
- web server command: cd frontend && VITE_SUPABASE_URL='http://127.0.0.1:54321' VITE_SUPABASE_ANON_KEY='e2e-public-key' VITE_API_BASE='http://127.0.0.1:8000' npm run build && npm run preview -- --host 127.0.0.1 --port $E2E_PORT; reuseExistingServer outside CI
- auth setup project: none — seed uses deterministic browser routes for Supabase Auth and the API; this is a UI browser smoke, not a full local-stack E2E
- storageState: none
- seed: frontend/tests/e2e/seed.spec.ts — protects #5 by requiring a visible API failure and a working retry
- browser CLI: playwright-cli 0.1.22 on PATH; Hermes has no dedicated command-skill target, so use the global CLI
- updated: 2026-11-01
