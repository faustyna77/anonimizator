# Fly.io — FastAPI MVP Deployment Research (2026-09-25)

## 1. Python on managed VMs / containers
- Firecracker VMs; Docker images or buildpacks. FastAPI deploy via Dockerfile (python:3.11-slim + uvicorn/gunicorn). `fly deploy` builds, pushes image, starts VM.
- Link: https://fly.io/docs/apps/deploy/

## 2. flyctl CLI
- Go binary (`brew install flyctl`). Key: `fly auth login`, `fly launch`, `fly deploy`, `fly logs`, `fly scale`, `fly ssh console`, `fly status`. Config via `fly.toml` (app, build.dockerfile, [http_service] internal_port = 8000, [[services]] ports).
- Repo: https://github.com/superfly/flyctl; docs: https://fly.io/docs/flyctl/

## 3. Docs (GitHub MDX)
- Open-source MDX at https://github.com/superfly/docs; rendered https://fly.io/docs/. PR-based contributions.
- Verified accessible.

## 4. Free allowance / pricing
- Free tier: shared-cpu VMs (2-3 small), 256MB RAM, 3GB persistent volume, 100GB egress/mo; Postgres small instance free. Overages ~USD 5/VM/mo, USD 0.15/GB egress, Postgres ~USD 15/mo small.
- Link: https://fly.io/pricing; https://fly.io/docs/about/free-allowance/ (verify current rates before commit)

## 5. Persistent processes / WebSockets / multi-region
- VMs persistent (not serverless); WebSockets native (TCP/HTTP upgrade, no special config). Multi-region: `fly regions add`; anycast edge routes to nearest healthy region; rolling zero-downtime deploys.
- Links: https://fly.io/docs/apps/multi-region/; https://fly.io/docs/reference/websockets/

## 6. Co-located services (Fly Postgres / storage)
- Fly Postgres: `fly postgres create` / `fly postgres attach`; connect via private network (host `db.internal` or `.flycast`). Volumes (`fly volumes create`) mount to VM — survive redeploy only if volume attached. S3-compatible via external R2 / Tigris / AWS S3.
- Links: https://fly.io/docs/reference/postgres/; https://fly.io/docs/reference/volumes/; https://fly.io/docs/apps/storage/

## 7. MCP / integration
- No native `fly mcp` command found. Integration = expose FastAPI REST/OpenAPI endpoint; MCP clients call via HTTP or bridge script. Standard REST/GraphQL patterns.

## 8. Global deployment
- Anycast IP + edge proxy = single global endpoint; select regions (ams, iad, sin, nrt, etc.). Auto-routing to nearest healthy VM. Custom domains via `fly certs add`.
- Link: https://fly.io/docs/apps/deploy/; https://fly.io/docs/reference/custom-domains/

## 9. FastAPI gotchas / tips
- Bind to 0.0.0.0 (`--host 0.0.0.0 --port $PORT`); do NOT bind 127.0.0.1.
- Use gunicorn + uvicorn workers (`gunicorn -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT`) in Dockerfile.
- `fly.toml` must match container port with `[http_service] internal_port`; Fly injects `$PORT`.
- Configure `[checks]` (TCP or HTTP /health) to avoid unwanted restarts.
- WebSockets: Fly proxy handles upgrade; ensure long-lived connections are allowed (no aggressive proxy timeout).
- Do not rely on local filesystem for state; use Postgres + external S3.
- Cold start: shared-cpu ~1-2s; use performance CPU for lower latency.
- Link: https://fly.io/docs/apps/deploy/ (Dockerfile framework deploy)

## Verified URLs (accessed / confirmed)
- https://fly.io/pricing — accessible
- https://fly.io/docs/flyctl/ — accessible
- https://github.com/superfly/flyctl — accessible
- https://github.com/superfly/docs — accessible (MDX source)
- https://fly.io/docs/apps/deploy/ — accessible
