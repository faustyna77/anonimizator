---
change_id: testing-panel-response-safety
title: Test panel and response safety
status: implementing
created: 2026-10-23
updated: 2026-10-24
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Panel and response safety".
Risks covered: #5, #6. Test types planned: contract + unit + browser smoke.
Risk response intent:
- #5: prove API failures and disallowed origins produce actionable UI/error behavior while allowed origins keep their contract; challenge the assumption that local success predicts deployed configuration; avoid CSS-only state tests without a failing request.
- #6: prove unknown, altered, or missing markers do not reveal, corrupt, or silently replace protected data; challenge the assumption that markers are always valid and complete; avoid snapshotting a single fully valid response.
After creating the folder, follow the downstream continuation rule.
