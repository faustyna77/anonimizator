---
date: 2026-10-19T18:25:46+02:00
researcher: Hermes Agent
git_commit: c6d228eb169ee2e316cfdec0f2ee9dab8c0574a5
branch: master
repository: anonimizator
topic: "Phase 1 test rollout: confidentiality and anonymization boundaries"
tags: [research, backend, access-control, anonymization, testing]
status: complete
last_updated: 2026-10-19
last_updated_by: Hermes Agent
---

# Research: Confidentiality and anonymization boundaries

**Date**: 2026-10-19T18:25:46+02:00
**Researcher**: Hermes Agent
**Git Commit**: c6d228eb169ee2e316cfdec0f2ee9dab8c0574a5
**Branch**: master
**Repository**: anonimizator

## Research Question

For rollout Phase 1 of `context/foundation/test-plan.md`, ground the code paths and existing tests for:

1. preventing an authenticated office from reading or mutating another office’s documents, rules, and indirect marker mappings; and
2. consistently replacing the five built-in PII classes in PDF/DOCX while preserving a mapping usable for the owned document’s later response restoration.

## Summary

The inspected backend derives `AccessContext` from a verified Supabase user and persisted profile, then applies its `office_id` to document and rule repository queries (`backend/app/auth.py:36-80`, `backend/app/document_repository.py:15-96`, `backend/app/office_rule_repository.py:47-151`). The ownership predicate is present on the inspected persistence paths, but the highest-risk mapping, document-state mutation, and document-to-office-rule interactions are not proven by a real PostgreSQL integration path; current service/API checks frequently substitute fakes or monkeypatched repository behavior (`backend/tests/test_document_access.py:72-228`, `backend/tests/test_api_access.py:405-591`).

The inspected anonymizer supports five built-in classes—IBAN, email, PESEL, NIP, and telephone—and produces per-document markers with value reuse after canonicalization (`backend/app/anonymization.py:102-175`, `backend/app/anonymization.py:211-253`). Unit and format tests exercise the five types, but the persisted mapping plus later restoration path is currently demonstrated for a DOCX containing PESEL rather than both formats with the complete five-type fixture (`backend/tests/test_anonymization.py:10-46`, `backend/tests/test_document_formats.py:66-161`, `backend/tests/test_document_service.py:158-203`).

## Detailed Findings

### Access context and document ownership

- In the inspected protected dependency path, a missing or invalid bearer credential yields 401; a verified user is resolved to a server-built `AccessContext` whose `profile_id` and `office_id` come from the persisted profile (`backend/app/auth.py:28-80`). This establishes identity but does not itself prove resource ownership.
- The inspected document repository writes the trusted office/profile into a new record, filters point reads by document ID plus `access_context.office_id`, filters lists by that office, and reuses the scoped point read before changing status or mapping fields (`backend/app/document_repository.py:15-96`).
- On the inspected read paths, document history uses the scoped list; download requires a scoped ready record and recomputes the expected server-derived result key before presigning (`backend/app/document_service.py:217-264`). The FastAPI routes map an unavailable download or deanonymization result to the same 404 contract (`backend/app/main.py:210-269`).
- The later deanonymization path is an indirect mapping-access boundary: it performs the scoped document lookup before reading `encrypted_mapping`, accepts only a ready record, decrypts/validates mapping keys, and substitutes known markers (`backend/app/document_service.py:161-202`). The public response model exposes restored response text, not the encrypted mapping (`backend/app/main.py:61-83`, `backend/app/main.py:241-269`).
- Existing PostgreSQL coverage proves a foreign context cannot retrieve a document and proves rule repository get/update/delete isolation (`backend/tests/test_document_repository.py:31-74`, `backend/tests/test_office_rule_repository.py:41-91`). It does not call `mark_document_ready` or `mark_document_failed` with the foreign context and assert the original row remains unchanged.
- In the inspected service and API tests for history, download, and deanonymization, monkeypatched/fake services encode the office predicate inside the test double (`backend/tests/test_document_access.py:72-127`, `backend/tests/test_document_access.py:150-228`, `backend/tests/test_api_access.py:532-591`). Those checks establish request propagation and HTTP behavior, not the joined persistence-to-service boundary.

### Office rules as a cross-feature confidentiality boundary

- Rule creation assigns the server-derived office; rule reads, enabled snapshots, updates, and deletes filter through `access_context.office_id` (`backend/app/office_rule_repository.py:47-151`). The production rule service builds the document anonymizer from that enabled scoped snapshot (`backend/app/office_rule_service.py:151-175`).
- The existing PostgreSQL rule test proves foreign CRUD denial (`backend/tests/test_office_rule_repository.py:41-91`). The inspected document-processing tests inject their own snapshot provider instead of exercising an enabled rule stored for a separate office (`backend/tests/test_document_service.py:75-155`).
- Therefore, a two-office integration scenario is needed: an enabled phrase/regex from office A must not alter office B’s anonymized artifact or B’s persisted mapping. This is an inferred gap from the inspected production join, not a claim that the current predicate is absent.

### PII detection, document formats, and mapping persistence

- The built-in rule set contains IBAN, email, PESEL, NIP, and telephone; PESEL, NIP, and IBAN apply checksum validation, while email and phone apply structural validation (`backend/app/anonymization.py:102-175`). Custom phrase and RE2 regex rules also feed the same anonymizer after validation (`backend/app/anonymization.py:31-73`, `backend/app/anonymization.py:188-209`).
- The anonymizer resolves overlaps by position, longest match, and priority; it creates marker values as `[TYPE_n]`, reuses an existing marker for a canonicalized `(type, value)` pair, and stores the first matched spelling in the mapping (`backend/app/anonymization.py:211-253`). A test oracle must therefore define expected canonicalization and first-spelling behavior independently, rather than regenerate expected output from production patterns.
- The upload service persists a processing record, writes source content, obtains an office-scoped active anonymizer, transforms PDF/DOCX bytes, encrypts serialized mapping, and marks the document ready (`backend/app/document_service.py:61-116`). Only `pdf` and `docx` dispatch into format adapters (`backend/app/document_service.py:120-128`).
- The DOCX adapter processes body paragraphs, nested tables, headers, and footers by assembling run text and applying replacements in reverse order; parser/save/location failures become controlled processing errors (`backend/app/document_formats.py:23-111`). The PDF adapter rejects a document without usable extracted text, redacts text found through `search_for`, and fails if extracted text cannot be located for redaction (`backend/app/document_formats.py:114-170`).
- Existing format tests use generated synthetic documents and assert all five markers for DOCX and PDF; the PDF case also asserts source values are absent from extracted text and output bytes (`backend/tests/test_document_formats.py:66-161`). Existing service persistence coverage uses a DOCX and one PESEL, while later restoration tests use a custom `[KLIENT_1]` mapping (`backend/tests/test_document_service.py:158-203`, `backend/tests/test_document_access.py:150-228`).

## Recommended Test Boundaries

1. **PostgreSQL integration for ownership.** Reuse `migrated_session_factory`, which requires an explicit `_test` PostgreSQL URL and applies migrations (`backend/tests/conftest.py:20-53`). Create two offices/profiles, then prove a foreign context cannot retrieve, list, download, deanonymize, mark ready, or mark failed on office A’s document; assert no result URL or restored PII and unchanged state for A.
2. **Real service plus persisted rule snapshot.** Store distinct enabled rules for offices A and B, construct the production rule service, and process B content that matches A’s rule. Assert A’s marker/mapping is absent from B’s artifact and encrypted mapping.
3. **Format-to-mapping integration with fake storage.** Parameterize a PDF and DOCX synthetic fixture that contains the five built-in types, valid formatting variants, repeated canonical values, and documented checksum near-misses. Assert artifact text, independently authored expected markers/mapping, encrypted persisted mapping, and owned-document response restoration. Keep checksum/overlap boundary matrices at the cheaper `DocumentAnonymizer` unit layer.
4. **Independent oracle.** Put expected source values, allowed near-misses, and marker/mapping expectations in test data authored separately from `_RULES`; do not compute expected output by importing the production patterns. Generated documents remain useful for DOCX-run and PDF-layout cases; static synthetic fixtures add parser realism.

## Code References

- `backend/app/auth.py:36-80` — verified user and server-derived access context.
- `backend/app/document_repository.py:15-96` — office-scoped document create/read/list/state updates.
- `backend/app/document_service.py:61-128,161-264` — upload orchestration, mapping restoration, history, and download guard.
- `backend/app/office_rule_repository.py:47-151` — office-scoped rule persistence and enabled snapshot query.
- `backend/app/office_rule_service.py:151-175` — conversion of active scoped rules into the anonymizer.
- `backend/app/anonymization.py:102-175,211-253` — supported identifiers, validation, conflict order, and mapping semantics.
- `backend/app/document_formats.py:23-170` — supported DOCX/PDF transformation boundaries.
- `backend/tests/test_document_repository.py:31-74` — current real-PostgreSQL document isolation coverage.
- `backend/tests/test_document_access.py:72-228` — fake/monkeypatched access and mapping scenarios.
- `backend/tests/test_document_service.py:75-242` — fake-storage service and snapshot scenarios.
- `backend/tests/test_document_formats.py:66-161` — generated PDF/DOCX five-type format coverage.

## Architecture Insights

The backend’s security boundary is the server-derived `AccessContext`, carried from auth dependency to repository predicate and storage-key construction. Document processing also crosses an office-rule snapshot boundary before anonymization. The useful regression tests must preserve these real joins: an API-only fake may prove HTTP translation while missing a repository predicate, and an anonymizer-only test may prove text replacement while missing encrypted mapping persistence and owned-document restoration.

## Historical Context (from prior changes)

- **Supported:** The archived access plan requires the backend, rather than client input, to derive office ownership and reject cross-office use (`context/archive/2026-10-02-minimal-document-access/plan.md:36-40,62-64,94-104`). The inspected current access context and repositories follow that model (`backend/app/auth.py:61-80`, `backend/app/document_repository.py:25-38,41-96`).
- **Supported with current-scope extension:** The archived document-flow plan specifies the five built-ins, per-document/per-type counters, encrypted mapping, and office-scoped object keys (`context/archive/2026-10-03-document-anonymization-flow/plan.md:32-40,96-110`). The inspected current code implements those properties (`backend/app/anonymization.py:144-175,243-253`, `backend/app/document_service.py:71-103`).
- **Contradicted by current surface:** The archive placed deanonymization and office-rule editing outside S-01 (`context/archive/2026-10-03-document-anonymization-flow/plan.md:23-30`), whereas current routes and service code include response deanonymization and office-rule CRUD/snapshots (`backend/app/main.py:131-173,241-269`, `backend/app/office_rule_service.py:151-175`). Phase 1 testing must therefore cover those indirect boundaries even though the original document-flow archive did not.

## Related Research

Not applicable: this rollout phase has no earlier research artifact.

## Open Questions

- The inspected profile model was designed around one user-to-one-office relation. If the product needs multiple verified users to share one office, ownership semantics require a separate product and schema decision before this rollout treats that behavior as covered.
- The adapters explicitly cover the inspected DOCX areas and text-layer PDF path. Text boxes/comments/footnotes in DOCX and unusual PDF extraction/search mismatches are not proven support boundaries in the inspected code; do not introduce them as Phase 1 acceptance criteria without a scope decision.
- PostgreSQL integration execution requires `TEST_DATABASE_URL` naming a `_test` database (`backend/tests/conftest.py:20-29`). This research did not run that suite because no test database configuration was supplied.
