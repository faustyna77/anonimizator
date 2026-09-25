---
plan_name: first-deploy-mode
source: @context/foundation/infrastructure.md + @context/foundation/tech-stack.md
date: 2026-09-25
mode: first-deployment (mvp / scaffold)
---

## Decision (stack + infra cross-check)

- **Tech stack (`tech-stack.md`)**: Python / FastAPI / uv / Render / GitHub Actions / Supabase / Cloudflare Pages.
- **Infrastructure (`infrastructure.md`)**: Fly.io recommended (persistent Python container, multi-region, co-located Postgres, free allowance); Render = runner-up (free tier spin-down, single-region, Starter $7/mo for persistent).
- **Plan for first deploy**: use **Fly.io** (matches `infrastructure.md` recommendation: persistent Python container, multi-region, co-located Postgres, free allowance for MVP; `tech-stack.md` Render noted as runner-up / alternative if Fly.io overages / Docker gaps arise).

## Pre-conditions (verified from repo)

- `.venv/` exists with fastapi + uvicorn.
- `backend/app/main.py` = `app = FastAPI()` + `/health`; no routes yet (scaffold only).
- `pyproject.toml`: `uv_build`, entry `anonymizer-prawniczy`.
- `README.md` = stub (`# anonimizator`) — do not rely on.
- `context/foundation/tech-stack.md`: `package_manager: uv`, `deployment_target: render`, `ci_provider: github-actions`, `ci_default_flow: auto-deploy-on-merge`.
- `context/foundation/infrastructure.md`: Render score 5P/1Part; persistent Python container passes; DB co-located passes; needs Starter for persistent (not Free spin-down).

## Steps (plan-mode execution order — atomic, one at a time)

1. **Install `flyctl`:** `brew install flyctl` / curl per docs. Check `fly version`. Create `Dockerfile` (Python 3.11, `uv pip install`, `bind 0.0.0.0:$PORT`, `EXPOSE 8000`, `CMD uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`).
2. **Fly app + deploy:** `fly launch` (name, region `warsaw`/`frankfurt`, free plan). Add `fly.toml` (`[[services]]`, internal_port 8000, ports 80/443). `fly deploy`.
3. **Secrets:** `flyctl secrets set DATABASE_URL=... SECRET_KEY=...`. Rotate via CLI.
4. **Postgres (co-located):** `fly postgres create --name anonymizer-db`; attach via secret. Not required for pure endpoint MVP — add if auth/docs needed.
5. **GitHub Actions / CI:** `.github/workflows/fly.yml` on merge to `master` using `flyctl deploy`. `tech-stack.md`: `auto-deploy-on-merge`.
6. **Verification:** `fly status`; `curl <fly-url>/health`. Monitor `fly logs`. Check `bind 0.0.0.0:$PORT` (pre-mortem risk #3); cold-start 1-2s expected (`infrastructure.md`).
7. **Document storage (out of scope for first deploy)** — do NOT use local Fly volume (replica issue). Plan S3 / R2 / external for later.
8. **Multi-region (Phase-2):** `fly regions add` when EU latency needs fixing; current single-region sufficient for MVP.

## Risk / verification checklist (from infrastructure.md)

- [ ] `Dockerfile` / build: `bind 0.0.0.0:$PORT` present (pre-mortem risk #3 from `infrastructure.md`).
- [ ] Fly.io plan: free allowance limits (~$5 overage / ~$15/mo Postgres) — set billing alert; monitor `flyctl status`; upgrade VM if PDF uploads cause OOM.
- [ ] Backups / rollback: `fly deploy --image` needs tagged image; rollback to previous release via `fly releases`.
- [ ] Multi-region not configured initially; document `fly regions add` as Phase-2.

## What this plan does NOT cover (out of scope per infrastructure.md §Out of Scope)

- Docker customization beyond render-compatible build.
- CI/CID beyond GitHub Actions auto-deploy.
- Multi-region / HA / DR.
- Production monitoring / alerting beyond Render logs.
- M1L5 course material execution (skills in `.hermes/skills/` are separate from deploy).

## Source references for execution

- `context/foundation/tech-stack.md` (stack, deploy target Render, CI, auth flag)
- `context/foundation/infrastructure.md` (Fly.io recommendation + Render runner-up, anti-bias, pre-mortem, getting-started steps, risk register, verification notes)
- `AGENTS.md` line 5 (`Conventions observed`: `app = FastAPI()`, module `backend.app.main:app`)
- `backend/app/main.py` (existing `/health`; no routes)
