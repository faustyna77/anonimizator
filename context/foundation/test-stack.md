# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.64.1
- config: frontend/playwright.config.ts
- single-spec command: cd frontend && npx playwright test tests/e2e/seed.spec.ts
- full-suite command: cd frontend && npx playwright test
- base URL: http://127.0.0.1:4173
- port: 4173 (detected from Vite preview default; override with E2E_PORT)
- web server command: cd frontend && VITE_API_BASE='' npm run build && npm run preview -- --host 127.0.0.1 --port $E2E_PORT; reuseExistingServer outside CI
- auth setup project: none — the seed deliberately tests the signed-out public-configuration boundary; no local E2E user is configured
- storageState: none
- seed: frontend/tests/e2e/seed.spec.ts — protects #5 by requiring a visible configuration error
- browser CLI: playwright-cli 0.1.22 on PATH; Hermes has no dedicated command-skill target, so use the global CLI
- updated: 2026-11-01
