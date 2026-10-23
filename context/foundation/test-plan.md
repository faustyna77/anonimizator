# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-23

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the risk wins. Do not promote to e2e because e2e “feels safer.” Do not put a vision model on top of a deterministic check that already catches the regression.
2. **User concerns are first-class evidence.** Risks accepted during the interview carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents what could fail and why we believe it is likely — drawn from documents, interview, and codebase signal. It does not claim to know which line owns the failure. That knowledge is produced by `/10x-research` during each rollout phase. If the plan and research disagree about where the failure lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `backend/`, `frontend/src/`, `chrome-extension/`.

## 2. Risk Map

The top failure scenarios are ordered by impact × likelihood. Sources are evidence that surfaced a risk, not code anchors.

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | A user can access a document, rule, or marker mapping belonging to another office. | High | High | PRD:20, 27–28; roadmap:78–89; interview Q1 accepted |
| 2 | A PDF/DOCX reaches an AI workflow with one of the supported PII classes left unmasked or mapped inconsistently. | High | High | PRD:14, 20, 25–28; roadmap:93–104; interview Q1 accepted |
| 3 | The extension sends raw content, uses an invalid session, or fails to return the anonymized result in the AI workflow. | High | Medium | PRD:14, 23–28; roadmap:106–117; hot-spot dir `chrome-extension/src` — 7 changed paths/30d |
| 4 | A malformed, unsupported, or expensive document produces an uncontrolled server failure or avoidable processing cost. | Medium | Medium | PRD:14, 25–26; roadmap:40–43; hot-spot dir `backend/app` — 35 changed paths/30d |
| 5 | The panel hides a failed request or behaves differently against local and deployed API/CORS configuration. | Medium | High | tech-stack:8–10, 24; interview Q2 accepted; hot-spot dir `frontend/src` — 47 changed paths/30d; `backend/app` — 35 changed paths/30d |
| 6 | Deanonymization substitutes an unknown, altered, or missing marker incorrectly instead of preserving a safe, explicit outcome. | High | Medium | PRD:27–28; roadmap:132–143 |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | An authenticated principal cannot read or mutate another office’s data, including indirect document mappings. | Authentication alone proves ownership. | Auth/session shape, persisted ownership relation, repository boundary, error contract. | integration | Testing only authenticated happy paths. |
| #2 | Each supported PII type is consistently replaced and its mapping can support the documented later flow. | A single happy-path document represents all formats and boundaries. | Input extraction boundary, marker/mapping persistence, fixture source, format and error contract. | unit + integration | Expected values copied from production patterns. |
| #3 | Extension-side submission never exposes raw content to the AI page and handles invalid credentials or failed responses visibly. | A successful request proves the page flow and data boundary are safe. | Browser message flow, storage/auth boundary, API contract, page injection lifecycle. | integration + browser smoke | Mocking the extension’s internal messages end-to-end. |
| #4 | Invalid or unsupported input is rejected predictably, and processing failure does not leave a successful-looking result. | A 200 response on a small valid file proves resilience. | Validation boundary, size/type limits, external parser/storage effects, cleanup guarantees. | integration | E2E files for every parser edge case. |
| #5 | API failures and disallowed origins produce actionable UI/error behavior; allowed origins keep their contract. | Local success predicts deployed configuration. | API base URL selection, CORS policy, session headers, UI error/retry contract. | contract + browser smoke | Testing CSS state without a failing request. |
| #6 | Unknown, altered, or missing markers do not reveal, corrupt, or silently replace protected data. | Existing markers are always valid and complete. | Mapping lookup boundary, response parsing, fallback/error contract, document ownership checks. | unit + integration | Snapshotting a single fully valid response. |

## 3. Phased Rollout

Each row is a discrete rollout phase. Status values are maintained from artifacts on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Confidentiality and anonymization boundaries | Prove office isolation and supported PII replacement under realistic failures. | #1, #2 | unit + integration | complete | context/changes/testing-confidentiality-anonymization-boundaries/ |
| 2 | Extension and document integration | Prove browser-to-API behavior, unsafe input handling, and safe AI handoff. | #3, #4 | integration + browser smoke | not started | — |
| 3 | Panel and response safety | Prove API/CORS failure handling and safe deanonymization edge outcomes. | #5, #6 | contract + unit + browser smoke | not started | — |
| 4 | Quality-gates wiring | Make the established risk tests repeatable before delivery. | cross-cutting | gates | not started | — |

## 4. Stack

| Layer | Tool | Version | Notes |
|---|---|---|---|
| backend unit + integration | pytest | configured locally | `pytest.ini` targets `backend/tests`; PostgreSQL tests are explicitly marked. |
| frontend unit | Vitest | 5.0.3 | Existing `npm test` runs `vitest run`; coverage is not wired yet. |
| extension unit + integration | Node test runner | runtime-provided | Existing `node --test tests/*.test.mjs` script. |
| browser smoke | Browser Use CLI | current session | Use only for cross-boundary verification that unit/integration cannot provide. |
| accessibility | none yet — see Phase 4 | — | Add only if research finds a critical user-facing gap. |

**Stack grounding tools (current session):**
- Docs: Context7 — checked FastAPI TestClient/dependency overrides and Vitest coverage guidance; checked: 2026-10-19.
- Search: none — no search MCP used; checked: 2026-10-19.
- Runtime/browser: Browser Use CLI — available for targeted smoke verification; checked: 2026-10-19.
- Provider/platform: none — no provider quality-gate integration verified; checked: 2026-10-19.

The test base is meaningful: 15 backend pytest files, 4 frontend Vitest files, and 8 extension test files across the three product surfaces.

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|---|---|---|---|
| backend pytest | local + CI | required after §3 Phase 1 | access, anonymization, and API regressions |
| frontend Vitest | local + CI | required after §3 Phase 3 | client state and request-contract regressions |
| extension Node tests | local + CI | required after §3 Phase 2 | extension flow and packaging regressions |
| lint + production build | local + CI | required | syntax, UI-token, and build drift |
| targeted browser smoke | pre-prod | required after §3 Phase 3 | deployed API/CORS and browser-boundary failures |
| coverage reporting | local + CI | planned in §3 Phase 4 | unobserved gaps in risk-critical test paths |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in when its rollout phase ships.

### 6.1 Adding a backend confidentiality or anonymization test

Start from the protected behavior, not a production helper or regular expression. For an office-boundary test, persist two distinct offices through `migrated_session_factory`, create the owner record under office A, and assert both the owner success path and the office-B denial path. Re-read the owner record after the denial attempt when testing mutations.

Use fake storage and the controlled auth provider for document services; no backend test in this pattern contacts S3, Supabase, Fly, or a production database. PostgreSQL-marked tests require an explicitly supplied local/test `TEST_DATABASE_URL` whose database name ends with `_test`; the shared fixture applies migrations and truncates its test tables before and after each test.

For PII and document-format coverage, declare source values, expected markers, canonical variants, and near-misses in `backend/tests/pii_manifest.py`. Do not import `_RULES` or validators from application code. Reuse the manifest for both real PDF and DOCX factories, assert that the artifact contains markers but not source values, inspect the decrypted mapping, and prove authorized restoration while preserving an unknown marker unchanged.

### 6.2 Adding an extension integration test

TBD — see §3 Phase 2 for browser-to-API, token, and safe AI-handoff patterns.

### 6.3 Adding a panel/API contract test

TBD — see §3 Phase 3 for API failure, CORS, and retry-state patterns.

### 6.4 Adding a deanonymization test

TBD — see §3 Phase 3 for unknown, altered, and missing-marker safety patterns.

### 6.5 Running quality gates

Use Python 3.11 or newer with backend and test dependencies installed. Run the non-PostgreSQL suite without any database URL:

```sh
python -m pytest -q -m "not postgresql"
```

Run PostgreSQL integration tests separately and only against a disposable local database named with the `_test` suffix. A local Docker `postgres:16` container may be bound to `127.0.0.1:55432`; wait for `pg_isready`, export `TEST_DATABASE_URL` only in the shell running the tests, then run:

```sh
python -m pytest -q -m postgresql
```

Remove the named Docker container immediately after the gate. Never record a database URL, password, or cloud credential in tracked files. Do not point `TEST_DATABASE_URL` at Fly, another shared environment, or any database whose name does not end in `_test`.

### 6.6 Per-rollout-phase notes

- Confidentiality and anonymization boundaries: persist two offices for repository/service isolation, test office-scoped rule snapshots, and use an independent five-type PII manifest for the real PDF/DOCX → encrypted mapping → owner-restoration flow. The integration database is a disposable local PostgreSQL container; external storage and auth remain controlled fakes.

## 7. What We Deliberately Don't Test

- Other browsers, native AI applications, non-Polish input, and automatic name/surname detection — outside MVP. Re-evaluate if the product scope changes. (Source: PRD:30–31; roadmap:159–165.)
- Broad visual snapshot coverage — use targeted browser smoke only where a browser boundary adds signal. Re-evaluate if deterministic visual regressions become a reported risk. (Source: interview Q2 accepted.)
- Third-party cloud-provider outages — handle with observability and operational procedures, not local product tests. Re-evaluate if a provider-specific fallback is introduced. (Source: tech-stack:24.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-19
- Stack versions last verified: 2026-10-19
- AI-native tool references last verified: 2026-10-19

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool’s `checked:` date is older than three months,
- the project’s tech stack changes (new framework or test runner),
- §7 negative space no longer matches what the team believes.
