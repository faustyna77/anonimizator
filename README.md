# anonimizator

S-01 is a protected, single-document anonymization flow for legal offices. An authenticated lawyer can upload one PDF or DOCX up to 10 MB, receive an anonymized file in the same format, and later download only that anonymized result from their office-scoped history.

## S-01 data boundary

The backend derives the trusted user, profile, and office solely from `AccessContext`. The browser never submits an office identifier, S3 object key, or marker mapping.

- The original upload and anonymized result are retained in S3 under a server-derived office and document key.
- PostgreSQL stores document metadata and the encrypted marker mapping; it does not store document file contents.
- The panel can list safe metadata and receive a five-minute, server-authorized URL for a ready anonymized result.
- S-01 provides no route to download an original or read an encrypted mapping. It does not give the browser direct S3 access.

## Server-only S3 configuration

Create a private bucket and configure its server-only credentials in local backend configuration or the Fly secret store. Required names are:

- `S3_BUCKET`
- `S3_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `DOCUMENT_MAPPING_ENCRYPTION_KEY`

Generate and store the Fernet mapping-encryption key outside the repository. Do not put any of these names or values in `VITE_*`, `frontend/`, Docker build arguments, API responses, or tracked local configuration. Copy `.env.example` for local setup; it contains placeholders only. See [docs/environment.md](docs/environment.md) for the complete configuration boundary.

## Local regression gate

Install backend development dependencies, create a disposable local PostgreSQL database whose name ends in `_test`, then run the backend suite from the repository root:

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
TEST_DATABASE_URL='postgresql+psycopg://postgres:postgres@localhost:5432/anonimizator_test' \
  .venv/bin/python -m pytest
```

`TEST_DATABASE_URL` is required only for PostgreSQL-marked integration tests. The fixture rejects a non-PostgreSQL URL or a database name not ending in `_test`, runs Alembic only against that database, and cleans its document, profile, and office data. Unit and API tests use a fake S3 client and a controlled Auth provider, so the suite does not require AWS, Supabase, or Fly credentials.

Run the independent panel gate from `frontend/`:

```bash
npm test
npm run lint
npm run build
```

## S-01 scope boundary

S-01 supports text-layer PDF and DOCX anonymization for PESEL, NIP, e-mail, REGON, telephone, Polish NRB account numbers, and IBAN values. OCR and scanned PDFs without a usable text layer, batch upload, external registry checks, and files larger than 10 MB are outside this slice.

## S-02 Chrome extension through Chrome Web Store

S-02 is a Chrome Manifest V3 extension distributed through Chrome Web Store after Google approval. A signed-in user can select one PDF or DOCX up to 10 MiB, send it to the existing protected anonymization API, and download only the anonymized result for manual attachment in the local AI application at `http://127.0.0.1:5173/`.

The user installs with **Add to Chrome** and never creates `config.js`, downloads a ZIP, or enables developer mode. The publisher bundles only public Fly/Supabase client configuration into the reviewed Store package; it must never include AWS credentials, a Fernet key, a Supabase service-role key, a user password, a session token, or a client-selected office identifier. User installation and scope limits are documented in [chrome-extension/README.md](chrome-extension/README.md); publisher submission materials are in [chrome-extension/STORE_SUBMISSION.md](chrome-extension/STORE_SUBMISSION.md). The public [privacy policy](https://anonimizator-panel.fly.dev/privacy-policy) describes the data flow and current retention boundary.

Office rules and manual marker correction belong to S-03. Reversing markers from the encrypted mapping belongs to S-04.