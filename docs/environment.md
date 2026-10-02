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

`Settings.require_protected_route_configuration()` fails with variable names only when `DATABASE_URL`, `SUPABASE_URL`, or `SUPABASE_ANON_KEY` is missing. It never includes values in its error message. The service-role key remains server-only and must never be passed to the frontend.

Set `PANEL_ALLOWED_ORIGINS` to exact panel origins (for example, `https://panel.example.com`). Wildcard origins are rejected in production. `/health` is public; product routes require a verified bearer token and server-derived office context. API documentation (`/docs`, `/redoc`, `/openapi.json`) is available only in `development`, `local`, and `test` environments and is disabled in production.

## Migrations

Run migrations only with a local or test PostgreSQL URL:

```bash
DATABASE_URL='postgresql+psycopg://postgres:postgres@localhost:5432/anonimizator_test' \
  .venv/bin/alembic upgrade head
```

Do not run migrations from browser code or against the production Fly database as part of tests. The migration creates `offices` and `profiles`; `profiles.user_id` and `profiles.office_id` are both unique so one verified Supabase user can only have one office relation.

## Frontend and Fly panel build

The frontend build receives only these public variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE`

The Fly GitHub workflow supplies them as build arguments. Keep server credentials and `DATABASE_URL` out of `frontend/`, `VITE_*`, Docker build arguments, and GitHub workflow build environments.
