---
change_id: testing-confidentiality-anonymization-boundaries
title: Test confidentiality and anonymization boundaries
status: implementing
created: 2026-10-19
updated: 2026-10-19
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Confidentiality and anonymization boundaries".
Risks covered: #1, #2. Test types planned: unit + integration.
Risk response intent:
- #1: prove an authenticated user cannot access or mutate another office’s data or indirect mappings; challenge the assumption that authentication proves ownership; avoid authenticated happy-path-only tests.
- #2: prove every supported PII type is consistently replaced and mapping supports the documented later flow; challenge the assumption that one happy-path document covers formats and boundaries; avoid expected values copied from production patterns.
After creating the folder, follow the downstream continuation rule.
