# Render as MVP deployment — FastAPI research (2025/2026)

## Platform / model
- Render = cloud PaaS: web services, static sites, background workers, cron, Postgres, Key Value (Redis-compatible Valkey 8 / legacy Redis 6), private services.
- Regions: US-East (Oregon), US-West (California), EU-Frankfurt, AP-Singapore. Service + datastore should match region for private-network latency.
- Global edge / CDN via custom domains + TLS managed; not true multi-region active-active (mostly single-region per service).

## Python / FastAPI web service
- Docs: https://render.com/docs/deploy-fastapi
- Build: `pip install -r requirements.txt` (or `uv pip install`). Start: `uvicorn main:app --host 0.0.0.0 --port $PORT` (PORT env set by Render).
- Supports Docker image deploy; also native Python 3 runtime.
- Must bind `0.0.0.0`.

## CLI / API / deploy hooks
- CLI: https://github.com/render-oss/cli — install via Homebrew / curl / build (Go + Bubble Tea TUI). Commands: `render services list`, `render deploys create`, `render logs stream`, etc. Env: `RENDER_API_KEY`, `RENDER_HOST`.
- Deploy hooks: per-service secret URL in Settings → send GET/POST to trigger redeploy; regenerate if leaked. https://render.com/docs/deploy-hooks
- Auto-deploy from linked Git branch (push = deploy); manual deploy via CLI / dashboard / hook.
- Webhooks (events: deploy_started/deploy_ended) for external integrations: https://render.com/blog/light-up-your-builds-with-render-webhooks
- REST API (generated client); service→repo→client architecture.

## Free tier (current 2025/2026 — confirmed live)
- Plan: Hobby $0/mo workspace; compute: Free web service = $0/mo (512 MB RAM / 0.1 CPU).
- Limits: spins down after 15 min idle (~60 sec cold start); local filesystem ephemeral (lost on redeploy / spin-down); rollbacks only to last 2 deploys; bandwidth/pipeline minutes counted.
- Free also for: static site, Postgres, Key Value (Redis-compatible). Not for background workers/cron/private services at $0 (paid Starter+ $7/mo+).
- Pricing page: https://render.com/pricing
- Docs: https://render.com/docs/free

## Persistent processes / background workers
- Background Workers (no inbound traffic) listen to queue (Celery/Sidekiq/BullMQ/Asynq). Need paid plan for worker instances (Starter $7/mo+).
- Persistent Disk / SSD add-on ($0.25/GB/mo) for stateful file storage (separate from ephemeral FS).
- Cron Jobs (scheduled) separate service type.
- Free web service does NOT persist in-memory or filesystem across idle/spin-down.

## Co-located services
- Postgres (managed): region-selected; free tier available but paid for PITR / scaling.
- Key Value / Redis (Valkey 8): in-memory, disk-persistence on paid; free plan limited; use same region.
- Static Sites: CDN-backed, custom domain + TLS; build from repo.
- Private services: no public URL, only internal networking + other services.

## MCP / integration
- No native "MCP" (Model Context Protocol) server mentioned; integrate via REST API / CLI / deploy hooks / webhooks.
- Common pattern: GitHub Actions / webhook proxies trigger deploy hook after CI passes.
- Render integrates with GitHub/GitLab/Bitbucket natively (repo link); also Docker registry deploy.

## FastAPI / uvicorn gotchas for Render
- Bind `--host 0.0.0.0`; use `$PORT` env (Render injects); do not hardcode 8000.
- Use `uvicorn` with 1 worker or configure based on RAM (512 MB free = 1 worker max). For production: `gunicorn` + `uvicorn.workers.UvicornWorker` or `docker-compose` with multiple workers; Render scales via instance size / autoscaling (Pro+ $85/mo+), not by adding workers inside container.
- Ephemeral FS: no local SQLite / uploaded file persistence; use Postgres (or Render Key Value) + object storage (S3 / R2) if needed.
- Cold start (free): ~60 sec after idle; for MVP okay, for production use Starter/Standard.
- WebSocket / long-polling supported but free idle timeout kills connections after 15 min of no traffic.
- `requirements.txt` / `pyproject.toml` must include `fastapi`, `uvicorn`, `gunicorn` (optional). Use `python-dotenv` for config; do not commit secrets.
- Health check / readiness: Render does TCP check; add `/health` endpoint for monitoring.
- Log stream: `render logs stream` or Dashboard; stdout/stderr captured.

## Key links
- Deploy FastAPI: https://render.com/docs/deploy-fastapi
- Web services docs: https://render.com/docs/web-services.md
- Deploys / manual / hooks: https://render.com/docs/deploys, https://render.com/docs/deploy-hooks
- Pricing: https://render.com/pricing
- Free limits: https://render.com/docs/free
- Background workers: https://render.com/docs/background-workers
- Key Value (Redis-compatible): https://render.com/docs/redis
- CLI repo / install: https://github.com/render-oss/cli
- Postgres docs (search render.com/docs/postgresql)
- Status / regions: https://status.render.com/
