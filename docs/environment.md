# Environment configuration

## Backend

Copy `.env.example` to `.env` only for local development. Do not commit `.env`.

| Variable | Required for | Exposure |
| --- | --- | --- |
| `APP_ENVIRONMENT` | API documentation policy (`development`, `local`, or `test` exposes docs) | Server-only |
| `PANEL_ALLOWED_ORIGINS` | Comma-separated browser origins allowed by API CORS | Server-only configuration |
| `DATABASE_URL` | Alembic and protected backend routes | Server-only |
| `SUPABASE_URL` | Protected backend routes and browser Auth client | Public URL |
| `SUPABASE_ANON_KEY` | Protected backend routes and browser Auth client | Public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Future server-side Supabase admin operations | Server-only |
| `S3_BUCKET` | Document original/result object storage | Server-only |
| `S3_REGION` | AWS S3 client region for document storage | Server-only |
| `AWS_ACCESS_KEY_ID` | S3 credentials for document routes | Server-only secret |
| `AWS_SECRET_ACCESS_KEY` | S3 credentials for document routes | Server-only secret |
| `DOCUMENT_MAPPING_ENCRYPTION_KEY` | Fernet key for encrypted document marker mappings | Server-only secret |

`Settings.require_protected_route_configuration()` fails with variable names only when `DATABASE_URL`, `SUPABASE_URL`, or `SUPABASE_ANON_KEY` is missing. It never includes values in its error message. The service-role key remains server-only and must never be passed to the frontend.

`Settings.require_document_storage_configuration()` is called only by document-storage routes. It requires `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `DOCUMENT_MAPPING_ENCRYPTION_KEY`, reports only missing variable names, and never serializes their values. Generate the Fernet key locally, configure all five values in the backend/Fly secret store, and never put them in `VITE_*`, `frontend/`, build arguments, API responses, or tracked configuration.

Set `PANEL_ALLOWED_ORIGINS` to exact panel origins (for example, `https://panel.example.com`). Wildcard origins are rejected in production. `/health` is public; product routes require a verified bearer token and server-derived office context. API documentation (`/docs`, `/redoc`, `/openapi.json`) is available only in `development`, `local`, and `test` environments and is disabled in production.

## Migrations

Run migrations only with a local or test PostgreSQL URL:

```bash
DATABASE_URL='postgresql+psycopg://postgres:postgres@localhost:5432/anonimizator_test' \
  .venv/bin/alembic upgrade head
```

Do not run migrations from browser code or against the production Fly database as part of tests. The migration creates `offices` and `profiles`; `profiles.user_id` and `profiles.office_id` are both unique so one verified Supabase user can only have one office relation.

## Access-boundary test database

Backend integration tests require `TEST_DATABASE_URL`, not `DATABASE_URL`. It must point to a local or test PostgreSQL database whose name ends in `_test`; the fixture applies Alembic migrations and truncates `profiles` and `offices` before and after each test. This guard prevents the suite from selecting a normal application database or production Fly database by mistake.

```bash
TEST_DATABASE_URL='postgresql+psycopg://postgres:postgres@localhost:5432/anonimizator_test' \
  .venv/bin/pytest
```

When `TEST_DATABASE_URL` is absent, only the PostgreSQL-marked integration test is skipped; unit and controlled-auth tests do not contact Supabase. Do not set test URLs or any credentials in tracked files.

## Frontend and Fly panel build

The frontend build receives only these public variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE`

The Fly GitHub workflow supplies them as build arguments. Keep server credentials, `DATABASE_URL`, S3 credentials, and `DOCUMENT_MAPPING_ENCRYPTION_KEY` out of `frontend/`, `VITE_*`, Docker build arguments, and GitHub workflow build environments.

## F-01 boundary for later slices

S-01 document storage and S-03 office rules must consume the backend's `get_current_access_context` dependency as the sole source of the trusted user and office IDs. They must not accept client-selected office IDs or introduce a second authentication mechanism. Chrome-extension authentication and document storage remain outside F-01.
