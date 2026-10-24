---
date: 2026-10-23T19:52:09+02:00
researcher: Hermes Agent
git_commit: 45c4de7bf82f6fc6bd66011653d8c05c8d9309c1
branch: master
repository: anonimizator
topic: "Panel failures, CORS, and deanonymization response safety"
tags: [research, frontend, fastapi, cors, deanonymization]
status: complete
last_updated: 2026-10-23
last_updated_by: Hermes Agent
last_updated_note: "User delegated two safety choices: altered markers remain unchanged and empty mapping values are unavailable."
---

# Research: Panel failures, CORS, and deanonymization response safety

**Date**: 2026-10-23T19:52:09+02:00
**Researcher**: Hermes Agent
**Git Commit**: 45c4de7bf82f6fc6bd66011653d8c05c8d9309c1
**Branch**: master
**Repository**: anonimizator

## Research Question

Ground rollout Phase 3 from `context/foundation/test-plan.md`: determine the cheapest test layers for panel/API and CORS failures, and for unknown, altered, or unavailable deanonymization markers.

## Summary

- The inspected client request wrapper turns a rejected `fetch`—including a browser CORS rejection—into the fixed `REQUEST_FAILED` message and does not parse an error body (`frontend/src/api.js:27-103`). The panel has alert and retry UI for document and office-rule reads, while deanonymization clears prior output before awaiting the request (`frontend/src/App.jsx:209-248`, `441-482`, `532-540`, `634-644`).
- The inspected deanonymization endpoint accepts exactly one JSON property, `response_text`, and maps unavailable service results to one generic 404 response (`backend/app/main.py:241-269`). The service verifies the document through trusted office context, decrypts and validates the persisted mapping, replaces exact known markers, and preserves unmatched text (`backend/app/document_service.py:161-202`).
- Unit and HTTP-contract tests cover several safe outcomes, but the inspected suite lacks explicit tests for a deanonymization POST CORS preflight, rejected fetches on document history, successful-but-malformed deanonymization payloads in the frontend, and altered-marker boundary cases (`backend/tests/test_api_access.py:189-268`, `343-365`, `frontend/src/api.test.js:154-195`).
- User delegated the two unresolved safety choices to the implementation plan: a marker with adjacent text, such as `[KLIENT_1]suffix`, must remain unchanged as a whole, and an empty mapping value is unavailable rather than a valid instruction to erase a marker. The planned tests must expose any contrary behavior (`backend/app/document_service.py:184-202`).

## Detailed Findings

### Frontend request and panel failure contract

- `createProductApi` gets the current token before every request; a missing token yields `SESSION_REQUIRED` without calling `fetch` (`frontend/src/api.js:27-50`). A rejected fetch yields the generic `REQUEST_FAILED` error, so browser network/CORS details are not exposed to the panel (`frontend/src/api.js:40-50`).
- The shared wrapper maps 401, 403, 409, 422 and 404 to stable client errors before a component can render the response body (`frontend/src/api.js:53-103`). The deanonymization path has its own 422 message and maps unavailable results to `RESULT_UNAVAILABLE` (`frontend/src/api.js:65-89`).
- The panel loads documents and office rules into explicit loading/ready/error resources. Read failures render `role="alert"` plus a retry control that invokes the corresponding loader (`frontend/src/App.jsx:209-248`, `532-540`, `634-644`).
- On deanonymization submit, the panel clears previous output before the request. It renders a safe alert for a rejected request and protects updates with the request-generation check (`frontend/src/App.jsx:447-482`). A 401 also invalidates requests and clears the active session; a non-401 transport failure does not take that path (`frontend/src/App.jsx:192-207`).
- The client accepts any parseable successful JSON from the deanonymization endpoint; `App` assigns `result.response_text` directly. An absent, non-string, or empty response value has no explicit client error path, and the current result UI hides an empty string because the render condition is truthy (`frontend/src/api.js:99-103`, `frontend/src/App.jsx:459-465`, `709-715`).

### Backend CORS and HTTP contracts

- FastAPI configures CORS with configured origins, credentials, the request methods `GET`, `POST`, `PATCH`, `DELETE`, `OPTIONS`, and headers `Authorization` plus `Content-Type` (`backend/app/main.py:119-125`). The POST deanonymization request carries JSON and Authorization, so its browser path depends on this preflight contract (`frontend/src/api.js:140-144`).
- `Settings.allowed_origins` trims the comma-separated configuration, rejects an empty list, and rejects wildcard origins when `APP_ENVIRONMENT` is `production` (`backend/app/config.py:42-49`). The frontend default API origin is the Fly URL unless its build-time `VITE_API_BASE` is set (`frontend/src/App.jsx:22`). Actual deployed origin configuration is intentionally not inferred from local files.
- Existing backend tests verify allowed PATCH and DELETE preflight responses and production wildcard rejection. The inspected tests do not assert the deanonymization POST preflight or a disallowed-origin response (`backend/tests/test_api_access.py:343-365`, `610-656`).

### Deanonymization mapping safety

- The endpoint rejects malformed, extra-key, non-string, and oversized request payloads with the same 422 detail; it passes a trusted access context and URL document ID to the service (`backend/app/main.py:241-269`).
- The service requires a ready, office-scoped document with an encrypted mapping. Failed decryption, malformed JSON, an empty mapping, invalid marker keys, and invalid value types return `None`, which becomes the generic 404 response at the endpoint (`backend/app/document_service.py:170-202`, `backend/app/main.py:265-269`).
- A mapping key must match the bracketed marker grammar; only exact mapped keys are replaced. In the inspected replacement path, unknown and internally altered markers remain unchanged because they do not equal a mapping key (`backend/app/document_service.py:22`, `184-185`). Existing service tests cover an unknown marker and unavailable mapping states (`backend/tests/test_document_access.py:173-251`).
- A valid marker with adjacent text, such as `[KLIENT_1]suffix`, is an altered marker under the delegated policy and must remain unchanged as a whole. The present escaped-key matcher replaces the valid portion, so this is a regression test that should initially fail until the service contract is tightened (`backend/app/document_service.py:184-185`).
- Empty mapping values are unavailable under the delegated policy. The current type-only validation accepts them, so service validation must reject the mapping and preserve the generic 404 endpoint outcome (`backend/app/document_service.py:195-202`, `backend/app/main.py:265-269`).

## Test Gaps and Cheapest Useful Layers

1. Add service-level tests for exact known markers, unknown markers, internally altered markers, no-marker text, suffix/prefix variants, and empty mapping values. This isolates the deanonymization oracle without HTTP or browser setup.
2. Add FastAPI `TestClient` tests for deanonymization POST preflight from an allowed origin, disallowed-origin behavior, 422 request-shape safety, and 404 equivalence across unavailable mapping states.
3. Extend `frontend/src/api.test.js` with rejected-fetch cases for document history and with successful deanonymization bodies that omit or invalidate `response_text`. The expected outcome must be a fixed `ApiAccessError`, not an implicit empty result or raw payload.
4. Add one targeted authenticated browser smoke only after deterministic coverage. It must use a synthetic document and verify the configured deployed panel origin can make the deanonymization request; a controlled wrong-origin/CORS failure must show the generic error without signing the user out.

## Code References

- `frontend/src/api.js:27-103` — shared token, transport, HTTP status, and JSON error boundary.
- `frontend/src/App.jsx:192-248` — authentication-sensitive resource error handling.
- `frontend/src/App.jsx:441-482` — deanonymization submit, stale-request guard, and alert rendering.
- `frontend/src/App.jsx:709-715` — result rendering condition.
- `backend/app/main.py:119-125` — CORS middleware contract.
- `backend/app/main.py:241-269` — deanonymization request and response contract.
- `backend/app/document_service.py:161-202` — office-scoped mapping lookup, validation, and substitution.
- `backend/tests/test_api_access.py:189-268` — endpoint safety contract tests.
- `backend/tests/test_document_access.py:173-251` — service mapping safety tests.
- `frontend/src/api.test.js:112-195` — client deanonymization contract tests.

## Architecture Insights

- The frontend keeps API error classification at the shared request boundary and renders operation-specific safe messages in `App`.
- The backend deliberately collapses unavailable, foreign, malformed, and non-ready mapping states into one public 404 response, so the client must not distinguish these causes.
- The extension and backend test gate work completed in the prior rollout does not prove the browser panel’s deployed CORS contract. Phase 3 needs a focused browser smoke after deterministic tests rather than a broad end-to-end suite.

## Historical Context

- `context/changes/response-deanonymization/plan.md` specifies manual input of an AI response and no durable storage of that response. The current panel retains the response only in component state (`context/changes/response-deanonymization/plan.md:77-100`, `frontend/src/App.jsx:47-51`).
- `context/changes/testing-confidentiality-anonymization-boundaries/research.md` identified deanonymization as an indirect mapping-access boundary; its shipped tests established office isolation and safe unavailable mapping behavior. This Phase 3 work narrows to result integrity and user-visible request failures (`context/changes/testing-confidentiality-anonymization-boundaries/research.md:41-44`, `62`).

## Related Research

- `context/changes/response-deanonymization/research.md`
- `context/changes/testing-confidentiality-anonymization-boundaries/research.md`
- `context/changes/panel-kancelarii-ui/research.md`

## Open Questions

The exact deployed `PANEL_ALLOWED_ORIGINS` value and browser-smoke authentication path are not available from tracked files. The targeted browser smoke must verify them without reading or exposing secrets.
