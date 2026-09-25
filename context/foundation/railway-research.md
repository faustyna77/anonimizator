# Railway (railway.com) — MVP deployment research: Python FastAPI

Date: 2025-09-25 | For anonimizator (FastAPI + Chrome ext, target deploy considered)

## Verdict (concise)
Railway works for FastAPI MVP; no true free tier (paid-only after $5 trial credit / $1/mo free cap), persistent processes require volumes (with gotchas), co-located DB/Redis/S3 supported natively. Not the cheapest for always-on; best when you want managed infra + private networking out of the box.

---

## 1. Python / FastAPI container deployment
- 4 paths: (a) one-click template, (b) GitHub repo deploy, (c) CLI `railway up`, (d) Dockerfile (`python:3-alpine` + `hypercorn` / `uvicorn`).
- Official guide: https://docs.railway.com/guides/fastapi
- Config-in-code: `railway.json` / `railway.toml` defines `deploy.startCommand`; example uses Hypercorn (`hypercorn main:app --bind ::`). You can swap to `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`.
- Auto-detects `Dockerfile`; otherwise builds via Nixpacks (Python detected from `pyproject.toml`/requirements).
- Source: docs.railway.com/guides/fastapi (verified via web_extract).

## 2. Railway CLI
- Install: `npm install -g @railway/cli` (or via Homebrew / curl) → `railway login`.
- Key commands (docs.railway.com/cli/*):
  - `railway init` / `railway new` — create project, link cwd.
  - `railway up` — compress + upload + deploy; `-y` skips prompts; `-d` detached; `-s backend` target service; `-e staging` env; `-c` CI mode (stream logs, exit).
  - `railway dev` (experimental) — local Docker Compose with env injection + HTTPS (`railway dev up/down/clean/configure`).
  - `railway connect --service postgres` — local proxy to managed DB.
  - `railway volume browse /` / `railway volume files {list,upload,download}` — persistent storage management.
  - `railway domain add` / `railway redeploy` / `railway logs`.
- Note: CLI can sign you up / create account on first `railway up -y`.

## 3. Docs
- Primary: https://docs.railway.com (guides, reference, CLI, volumes, regions, pricing)
- FastAPI guide: https://docs.railway.com/guides/fastapi
- Volumes: https://docs.railway.com/volumes/reference
- Regions: https://docs.railway.com/deployments/regions
- Pricing page (live): https://railway.com/pricing

## 4. Pricing — NO free tier / paid only (critical)
From https://railway.com/pricing (verified via web_extract 2025-09-25):

| Plan | Monthly | Included | Per-service max | Replicas | Logs |
|---|---|---|---|---|---|
| Free Trial | $0 | $5 one-time (30d) | 2 vCPU / 1 GB | 2 | 7d |
| Free | $0 | $1/mo credits | 1 vCPU / 0.5 GB | 1 | 3d |
| Hobby | $5 | $5/mo | 48 vCPU / 48 GB | 6 | 7d |
| Pro | $20 | $20/mo | 1,000 vCPU / 1 TB | 42 | 30d |
| Enterprise | Custom | Custom | Custom | Custom | Custom |

Usage-based (per-second, meta monthly for comparison):
- CPU: $0.00000772/vCPU/s (~$20/vCPU/mo)
- Memory: $0.00000386/GB/s (~$10/GB/mo)
- Volumes: $0.00000006/GB/s (~$0.15/GB/mo)
- Egress: $0.05/GB
- Object Storage (S3-style bucket): $0.015/GB-month, free egress

Limits by plan (projects / services / members / max volume / custom domains / concurrent builds): Free Trial 2/5/3/500MB/1/3; Free 1/3/1/500MB/0/1; Hobby 50/50/3/5GB/2/3; Pro 100/100/unlim/1000GB/20/10.

Implication for MVP: always-on FastAPI with 1 vCPU + 1 GB = ~$30/mo resource + plan fee; $5 trial only covers ~1 week at that level. No truly $0 always-on option.

## 5. Persistent processes
- Processes are persistent while service runs; Railway deploys to containers, not serverless — long-running processes OK (FastAPI/Uvicorn stays up).
- **But** local/container filesystem is ephemeral across deploys; persistence requires **Volumes**.
- Volumes (https://docs.railway.com/volumes/reference):
  - Mount point configurable (`/app/data` for Nixpacks apps since build puts app under `/app`).
  - Size: Free/Trial 0.5 GB; Hobby 5 GB; Pro 50 GB (up to 1 TB on Enterprise); live-resize available paid.
  - Limits per project: Free 1, Trial 3, Hobby 10, Pro 20, Enterprise unlim.
  - Volumes mounted at **runtime**, not build/pre-deploy; write in `startCommand`, not `preDeploy`.
  - **Critical gotchas (verified from docs + Station report)**:
    - One volume per service only.
    - Replicas **cannot** be used with volumes (stateless replicas okay without volumes; with volumes = 1 replica only).
    - Volume-attached redeploy incurs downtime (Railway prevents parallel active mounts to avoid corruption; even with health check, brief downtime).
    - Down-sizing not supported; live resize up only.
    - Non-root images (`node` default UID) need `RAILWAY_RUN_UID=0` env var or volume writes fail (`EACCES`).
    - Volume deletion queued 48h (restorable via email link);
    - Volume mount disappearing between deployments reported (Station 2026-05-24) — automation/CLI can detach; verify after deploy.
  - Backup: manual + automated; restores via dashboard/CLI.
- Background workers: deploy separate service (same repo, different `startCommand`, e.g. `python worker.py`) connected to Redis over private network.

## 6. Co-located DB / storage (project-level, private networking)
All provisioned inside same Railway project; inter-service via **private domain** (`postgres.railway.internal`, `redis.railway.internal`) — no public IP needed.

- **Postgres**: managed, connection via `DATABASE_URL` reference variable; `railway add --postgres`; CLI `railway connect --service postgres`; daily backups; restore snapshots.
- **Redis**: `railway add --redis`; `REDIS_URL` injected; used for caching / job queues (BullMQ/etc.). Note Redis URI may need `?family=0` for ioredis IPv6 compatibility with Railway private DNS (documented in template notes for n8n/Evolution).
- **MySQL**: `railway add --mysql` available.
- **Storage Bucket (S3-compatible)**: `railway add --bucket`; private, S3-compatible endpoint; exposes `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`, `ENDPOINT` as reference vars. Object storage $0.015/GB/mo, free egress. Good for file uploads / attachments; not a filesystem mount.
- **Volume** (above) for local persistent files (uploads, SQLite, caches).
- All via reference variables (`${{Postgres.DATABASE_URL}}`) in `railway.json` / service settings — no hardcoding.
- Source: docs guides on fullstack Next.js + Langfuse + region docs (verified).

## 7. Global / region
- 4 Metal compute regions (+ global CDN via Cloudflare + Fastly):
  1. US West — California (`us-west2`)
  2. US East — Virginia (`us-east4-eqdc4a`)
  3. EU West — Amsterdam, Netherlands (`europe-west4-drams3a`) ← EU data residency / GDPR
  4. Southeast Asia — Singapore (`asia-southeast1-eqsg3a`)
- Region selectable per service in Settings; also in `railway.json` `multiRegionConfig`; default from Account Settings.
- Region change anytime, **no downtime** — unless service has attached volume (then downtime). So EU residency (Amsterdam) is straightforward if you start there / move early.
- Multi-region: assign replicas per region (stateless only — no sticky sessions; traffic routed nearest region → random within region). Use `railway.json` multiRegionConfig or dashboard.
- Data residency: SOC 2 Type II, SOC 3, self-serve GDPR DPA, EU-US/Swiss-US DPF; HIPAA BAA add-on (paid); no ISO 27001 listed.
- Source: https://docs.railway.app/reference/deployment-regions + comparedge summary (verified).

## 8. MCP / integration
- Railway deploys an **n8n MCP Server** template (`railway.com/deploy/n8n-mcp-server`) — bridges n8n workflows with Model Context Protocol, enabling AI agents to interact with workflows.
- Railway is used as host for MCP servers / Langfuse / n8n stacks; not a native MCP provider, but supports deploying MCP-compatible services easily.
- Private networking allows co-located workers / APIs to talk without public exposure (good for secure integrations).
- No native “Railway MCP server” — you deploy your own (e.g., FastAPI + MCP SDK) on Railway.

## 9. Gotchas / limitations (verified from docs + community reports)
1. **Pricing reality**: no free always-on tier; $5 trial = ~30d $5 credit; $1/mo free cap too low for FastAPI + DB.
2. **Volumes ≠ replicas**: if you need persistence, you get 1 replica max per service; scale horizontally = use DB/Redis for shared state, keep service stateless.
3. **Volume redeploy downtime**: unavoidable with attached volume (Railway blocks concurrent mounts to prevent corruption).
4. **Build vs runtime paths**: Nixpacks puts app at `/app`; volume mount must match (e.g., `/app/data`), and volumes unavailable at build/pre-deploy time.
5. **Non-root UIDs**: common Python/nginx images can fail on volume writes; set `RAILWAY_RUN_UID=0`.
6. **Private networking IPv6**: Redis/ioredis clients sometimes need `?family=0`; test `REDIS_URL` connection at deploy.
7. **Region + volume interaction**: move region = fine; with volume = downtime + data stays in original region (volume location tied to region; check if migration needed).
8. **Log retention**: 3d (Free) / 7d (Trial/Hobby) / 30d (Pro) — long-running MVP may need Pro for debugging.
9. **Concurrent builds**: 1 (Free) to 10 (Pro) — CI-heavy workflows need Pro.
10. **Volume deletion**: 48h window — don’t assume instant removal; restore via email.
11. **No built-in S/FTP** to volume; manage via CLI `volume browse` (TUI) or `volume files`.
12. **No persistent local SQLite across deploys** without volume; even then, prefer Postgres for production.

---

## Key links (all verified 2025-09-25 via web_extract / docs)
- FastAPI deploy guide: https://docs.railway.com/guides/fastapi
- Pricing: https://railway.com/pricing
- CLI ref: https://docs.railway.com/cli/init, /cli/up, /cli/dev
- Volumes: https://docs.railway.com/volumes/reference, /volumes
- Regions / data residency: https://docs.railway.com/deployments/regions
- Fullstack (Postgres + Redis + worker + bucket) guide: https://docs.railway.com/guides/fullstack-nextjs (pattern applies to FastAPI)
- Storage bucket / S3-style: referenced in Langfuse / Twenty CRM templates on railway.com/deploy/
- n8n MCP Server template: https://railway.com/deploy/n8n-mcp-server
- Station report (volume mount disappearance): https://station.railway.com/questions/persistent-volume-mount-disappears-from-f09497be

---

## Recommendation for anonimizator (FastAPI + Chrome ext, Polish law offices / EU)
- **Fit**: Good — fast deploy from `backend/app/main.py`, private networking for DB/Redis, EU region (Amsterdam) for GDPR/residency, managed Postgres for persistence.
- **Cost reality**: budget at least Hobby ($5/mo + usage) or Pro ($20/mo) for always-on with logs; $5 trial fine for 1–2-week MVP validation.
- **Deploy path**: `railway init --name anonimizator; railway up` (CLI) or add GitHub repo; set `railway.json` with `startCommand = "uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT"`; add `railway.json` multiRegion if needed.
- **DB**: `railway add --postgres` (EU West region), wire `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
- **Storage for anonymized outputs / PDFs**: use Storage Bucket (S3-compatible) rather than local volume (allows multi-service access, no volume-replica limits).
- **Persistence of uploads/cache**: if needed locally, mount volume at `/app/uploads`; accept 1-replica limit; or prefer bucket.
- **Gotcha to pre-check**: set region to Amsterdam (`europe-west4-drams3a`) at project creation; verify default region in Account Settings; use `RAILWAY_RUN_UID=0` if using non-root image; test `REDIS_URL` family param; design stateless FastAPI service with DB state.

Created by subagent (railway-research); no repo files modified (research-only). Written to workspace.
