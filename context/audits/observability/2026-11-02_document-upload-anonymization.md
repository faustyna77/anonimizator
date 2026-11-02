---
type: observability-audit
date: 2026-11-02 01:03 CET
mode: audit
commit: f38e64e
branch: master
dirty_tree: true
areas: [document-upload-anonymization]
area_source: foundation
runtime_proof: partial
error_tracker: platform stdout/stderr collector (assumed); no tracker SDK in repository
previous_report: null
findings: { critical: 0, high: 3, medium: 1, low: 0 }
---

# Observability audit — document upload and anonymization (2026-11-02)

## 1. TL;DR

- The critical PDF/DOCX upload flow catches storage, database, rule-snapshot, encryption, and parser failures in `DocumentProcessingService`, then converted them into a client-safe `DocumentProcessingError`; the route consequently returned 422, which misclassified operational outages as invalid documents.
- Before this audit, the route had no application error-reporting boundary. A handled failure therefore did not emit an application log or tracker event.
- The remediation selected for this audit is in the dirty working tree: operational exceptions now propagate to `/anonymize`, which returns a safe 500 and records `document_processing_failed` with a stack trace and sanitized context.
- The compensating database update to mark a document `failed` still suppresses its own exception; this can leave a record stuck in `processing` without an operator signal.

## 2. Capture model

- The backend container starts Uvicorn directly (`Dockerfile:12`). Uvicorn can emit uncaught request failures to stderr, but application code did not configure an error tracker or application logger before this audit.
- The authenticated upload route is `/anonymize` (`backend/app/main.py:176-216`). It parses the upload, calls `DocumentProcessingService.process_upload`, and maps controlled document errors to 422.
- Processing spans persistence, S3 storage, office-rule retrieval, PDF/DOCX conversion, mapping encryption, and a final database transition (`backend/app/document_service.py:61-118`).
- The new route-level reporting boundary uses `logger.exception` with the operation, document format, and trusted office UUID only (`backend/app/main.py:198-206`). It intentionally excludes document bytes, filename, mapping, tokens, and response text.

**Assumptions (outside the repository, not findings):**

- Unconfirmed: the production platform collects application stdout/stderr and routes error-level logs to monitoring.
- Unconfirmed: an alert or issue policy exists for `document_processing_failed`.

## 3. What reaches the tracker

Static and focused-test evidence only; no external tracker was contacted.

| Failure shape | API response | Platform logs / monitoring signal | Tracker | Verdict |
|---|---|---|---|---|
| Invalid or unsupported PDF/DOCX | 422 with controlled message | No operational event expected | Not configured in repository | Controlled client error |
| S3/storage failure during upload | 500 with generic safe message | `document_processing_failed` stack trace with sanitized context | Assumed stdout/stderr collector | Remediated and covered by focused tests |
| Failure while recording the `failed` status | Original response is preserved | None from this cleanup path | Not configured in repository | Still open |

## 4. Systemic root causes

1. **Operational exceptions were flattened into a validation error.** `DocumentProcessingService.process_upload` previously wrapped every non-document exception in `DocumentProcessingError` (`backend/app/document_service.py:111-116` at audit start); the API mapped that class to 422 (`backend/app/main.py:195-197`). This hid storage and database outages behind a user-input status.
2. **Handled route failures had no reporting boundary.** The API contained CORS middleware but no application-level error logger or tracker invocation (`backend/app/main.py:119-125`, `195-201` at audit start). A broad `except` avoided Uvicorn's uncaught-exception path without creating a replacement signal.
3. **Compensation errors are discarded.** `_mark_failed` catches every exception and returns (`backend/app/document_service.py:131-139`), preserving the primary client result but eliminating evidence that document state cleanup failed.

## 5. Findings by area

### Document upload and anonymization

| # | Location | Category | Severity | What happens in production | Fix direction |
|---|---|---|---|---|---|
| 1 | `backend/app/document_service.py:111-116`; `backend/app/main.py:195-201` | flattened-response | high | A storage, database, encryption, rule-snapshot, or transformation outage was reported as 422, so the user was told the document was invalid and the handled exception produced no application monitoring signal. | Preserve operational exceptions to the API boundary; return a safe 500 and log the exception with only non-PII context. **Remediated in the working tree.** |
| 2 | `backend/app/document_service.py:131-139` | swallowed | high | A failed compensating transition can leave an uploaded document permanently `processing`; neither the client nor responders receive a signal that reconciliation is needed. | Emit a separate sanitized exception event for failed-state persistence while retaining the original client-safe error. |
| 3 | `backend/app/main.py:119-125` and `195-201` at audit start | logged-not-captured | high | Before the remediation, handled upload failures bypassed Uvicorn's uncaught-error output and had no application-level event. | Keep a single route-level reporting boundary to avoid duplicate reports and route stdout/stderr into the production monitoring service. **Remediated in the working tree.** |
| 4 | `backend/app/document_service.py:190-204`; `backend/app/main.py:265-269` | flattened-response | medium | Mapping decryption or validation failure is indistinguishable from a genuinely unavailable or foreign document, returning a privacy-preserving 404 with no diagnostic event. | Retain the 404 privacy contract but report a sanitized mapping-decryption/validation event. |

### Platform / plumbing

No code-based tracker configuration was found in `backend/requirements.txt` or `backend/app/`. That is an external deployment decision, not an audit finding. The selected fix relies on the assumed production stdout/stderr collection path and should later be verified there.

## 6. Recommended fix order

1. **Done in working tree: fix #1 and #3.** Preserve operational exceptions, return 500, and emit exactly one sanitized stack trace at the API boundary. This removes the highest-impact blind spot without exposing document data.
2. **Next: fix #2.** Report cleanup-transition failures as a separate event with the trusted document UUID and office UUID, never the original filename, document content, mapping, token, or object key.
3. **Then: fix #4.** Add a server-side event for mapping corruption/decryption failure while retaining the deliberately opaque 404 response.
4. **Deploy verification.** Trigger a synthetic storage failure in a non-production environment and confirm one `document_processing_failed` event reaches the chosen monitoring sink. Do not use customer documents or production credentials.

## 7. Method and limits

- Scope was one critical foundation-derived flow: authenticated upload of a PDF/DOCX through parsing, anonymization, persistence, and API response.
- Two independent read-only audits reviewed the flow and platform plumbing. The highest-severity claims were spot-checked in `backend/app/document_service.py`, `backend/app/main.py`, `backend/app/auth.py`, and focused backend tests.
- No external Sentry or other monitoring endpoint was configured or contacted. Runtime proof is partial: focused tests prove the API returns a safe 500 and emits a captured error record with exception information, but they cannot prove a deployment dashboard or alert rule.
- Focused test evidence after the selected remediation: `backend/tests/test_document_service.py::test_service_preserves_an_operational_storage_failure_for_the_api_boundary` and `backend/tests/test_api_access.py::test_anonymize_reports_an_unexpected_processing_failure_without_document_content`.
