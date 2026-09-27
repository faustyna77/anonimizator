---
name: fastapi-deploy-flyio
description: Deploy FastAPI backend to Fly.io.
arguments: []
tags: [deployment, fly.io, fastapi, infra]
---

# FastAPI → Fly.io deployment (class-level procedure)

Use when deploying (or redeploying) a FastAPI app from this repo to Fly.io.
Procedure is ordered; do not skip steps.

## Always-on rules
- `bind 0.0.0.0:$PORT` in Dockerfile CMD is mandatory — missing it causes silent crash (pre-mortem #3 from `infrastructure.md`).
- `.fly.dev` requires allocated IPs (`flyctl ips allocate-v4/v6`) and working `fly.toml` `[[services]]`; without IPs the host resolves NXDOMAIN.
- Free-plan machines auto-stop when idle (`auto_stop_machines = true`); first request after idle = 1-2s cold start, not failure.
- Secrets (`DATABASE_URL`, `SECRET_KEY`) go via `flyctl secrets set --app <name>`; never commit to repo or `.env` for production.
- Fly Postgres (managed) is co-located; use `fly mpg create` rather than unmanaged `fly postgres create` for supported ops; region must match app region (`ams`/etc.).

## Procedure (ordered)

1. **Dockerfile** — Python 3.11-slim, `pip install`, copy `backend/` + `src/`, `bind 0.0.0.0:8000`, expose 8000. Fix requirements path (copy `backend/requirements.txt` to `/app/requirements.txt` or adjust `RUN` to match).
2. **fly.toml** — `app = "..."`, `primary_region = "ams"` (or verified region from dashboard), `[[services]]` with `internal_port = 8000`, ports 80/443. No `auto_stop_machines` override unless needed.
3. **Build check locally** — `docker build -t ... .`; if fails on `requirements.txt` not found, fix COPY/RUN path; do not proceed to deploy with broken image.
4. **Create / verify app** — `flyctl apps create <name>` or verify existing; `flyctl auth login` if not; ensure billing/setup is done (free allowance needs card setup once).
5. **Allocate IPs** — `flyctl ips allocate-v4 --app <name> --yes`; same for v6. Confirm in dashboard (Certificates / Hostname tab) — without this `.fly.dev` won't resolve.
6. **Secrets** — `flyctl secrets set DATABASE_URL="..." SECRET_KEY="..." --app <name>`. Generate `SECRET_KEY` with `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`. Do NOT put values in chat; execute locally.
7. **DB (if needed)** — `echo "y" | flyctl mpg create --name <db> --region <region> --org personal`; attach URL to secrets; no local volume (infrastructure.md: volumes disable replicas).
8. **Deploy** — `flyctl deploy --app <name>`. Watch logs for `Uvicorn running on http://0.0.0.0:8000`. If `app not found`, app missing or wrong region.
9. **Verify** — `curl -L https://<name>.fly.dev/health`; if `NXDOMAIN` after IP allocation, wait 2-5 min or check `flyctl status`; if server runs but returns error, check `/docs` (OpenAPI) and `backend/app/main.py` routes.
10. **CI / GitHub** — `.github/workflows/fly.yml` with `superfly/flyctl-actions/setup-flyctl` + `flyctl deploy --app <name> --remote-only`; add `FLY_API_TOKEN` secret in repo. Only after stable deploy.

## Pitfalls (each with mechanism)
- **Dockerfile `bind` missing** → server starts but Fly proxy gets connection refused; logs show startup complete but no response. Fix: `CMD ["uvicorn", ..., "--host", "0.0.0.0"]`.
- **Free-plan auto_stop** → machine sleeps after idle; first curl after long gap gets delay, not error. Fix: expect cold-start; use `fly machine start` or keep minimal traffic.
- **IP allocation skipped** → `.fly.dev` never resolves (`NXDOMAIN` / Safari "cannot find server"). Fix: `flyctl ips allocate-v4/v6`; confirm dashboard shows IPs.
- **Secrets in repo** → `DATABASE_URL` committed = breach; always CLI `flyctl secrets set`. Rotate via same command.
- **Region mismatch** → `frankfurt` or `warsaw` may be unavailable for free org; verify with `flyctl status` or dashboard; fallback to `ams`.
- **Build error `requirements.txt` not found** → COPY order wrong in Dockerfile (copy `backend/requirements.txt` to `/app/requirements.txt` then `RUN pip install -r requirements.txt`).
- **Frontend deploy blocked** → `wrangler` needs `CLOUDFLARE_API_TOKEN` secret; build locally with `npm run build`; publish with `npx wrangler pages deploy dist --project-name ...`.

## References
- `context/foundation/infrastructure.md` (verified 2026-09-25)
- `context/foundation/tech-stack.md`
- `references/fly-deploy-decisions.md` (quick decision table + shorthand)
- Project: `anonimizator` (this repo)
