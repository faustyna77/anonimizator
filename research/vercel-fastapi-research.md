# Vercel for Python FastAPI — MVP deployment research

Source: Vercel docs (2026-08/09/2026 updates) + GitHub + changelog. Verified via `vercel.com/docs/*` extracts. Marked beta/preview where applicable.

## 1. Python serverless function support — Edge vs Node vs Python runtime
- **Python is an official runtime**, not Edge. Vercel Function runtimes: Node.js, Bun, **Python**, Rust, Go, Ruby, Wasm, **Edge** (V8-based, isolated, no VM/container) [vercel.com/docs/functions/runtimes].
- **Python runs ASGI/WSGI** (FastAPI, Flask, Django) as a Vercel Function via the Python runtime. Not Edge: Edge is JS/V8; Python requires container/function bundle.
- **FastAPI on Vercel**: zero-config detection; looks for instance named `app` at `app.py`, `index.py`, `server.py`, `main.py`, `src/` or `app/` equivalents; entrypoint set via `[tool.vercel] entrypoint = "backend.app.main:app"` [vercel.com/docs/frameworks/backend/fastapi] [vercel.com/kb/guide/ship-a-fastapi-app-on-vercel]. Bundle size: **500 MB max for Python** (vs 250 MB others) [vercel.com/docs/functions/limitations].
- **Evidence**: https://vercel.com/docs/functions/runtimes/python · https://vercel.com/docs/frameworks/backend/fastapi

## 2. Vercel CLI
- Install: `npm i -g vercel` (or pnpm/yarn/bun); native binary available via `npm i -g @vercel/vc-native --force`. Commands: `vercel dev`, `vercel deploy`, `vercel login`, `vercel agent init` (generates AGENTS.md for deploy best practices) [vercel.com/docs/cli] [github.com/vercel/vercel].
- **Evidence**: https://vercel.com/docs/cli · https://github.com/vercel/vercel

## 3. Docs (MDX) on GitHub
- Vercel docs are published from internal / multi-repo source (not a single public `vercel/docs` repo). References to `.mdx` exist in `vercel/components.build`, `vercel/next.js` issues (#93316 sources for Markdown), `vercel/eve` (changelog/docs site). The published docs site (`vercel.com/docs/*`) is authoritative; source is partially open (e.g., skill references at `github.com/vercel/components.build`) but not a single docs repo like `vercel/docs`. No single `github.com/vercel/docs` repo found.
- **Evidence**: github.com/vercel/components.build (docs.mdx skill refs); vercel/next.js discussion #93316

## 4. Free tier / cost
- **Hobby**: $0/mo; automatic CI/CD + global CDN + WAF included. Function limits: max memory 2 GB; max duration **300 s** (hard cap on Hobby); bundle 250/500 MB. Edge requests: 1M/mo included; fast data transfer 100 GB/mo.
- **Pro**: $20/mo + $20 usage credit; duration up to 800 s default, **1800 s extended maximum (Beta)**; memory 4 GB; flat-rate CDN with spike protection.
- **Enterprise**: custom, multi-region compute, 99.99% SLA.
- Pricing excludes VAT/GST [vercel.com/pricing] [vercel.com/docs/pricing].
- **Evidence**: https://vercel.com/pricing · https://vercel.com/docs/functions/limitations

## 5. Persistent processes / WebSocket / long-running workers — MAJOR LIMITATION
- Vercel Functions are **serverless (ephemeral)**: each invocation is a short-lived container/function on Fluid compute. No long-running workers, no persistent background tasks inside the function.
- **Max duration**: Hobby 300 s; Pro 800 s; extended 1800 s **(Beta)** — this is the hard execution-time cap, not a persistent process.
- **WebSocket / real-time**: Vercel has native WebSocket support through Edge/network (not per-function); for persistent/long-lived connections, use external services (Ably, Pusher, Socket.io with external adapter) or move to a persistent platform (Render, Railway, Fly, EC2). Do **not** expect a FastAPI WebSocket endpoint to stay open indefinitely — the function will terminate at max duration.
- **No cron/long workers inside function**: use Vercel Cron (separate) or external job runner.
- **Evidence**: https://vercel.com/docs/functions/limitations · https://ably.com/vercel/websockets-on-vercel (external guide)

## 6. Co-located DB / external DB
- **Vercel Postgres DISCONTINUED / moved**: Vercel Postgres is no longer available as of Dec 2024; existing DBs moved to **Neon** automatically. For new projects, connect via **Marketplace** (Neon, Supabase, PlanetScale, etc.) — Postgres provider integrations inject credentials as env vars [vercel.com/docs/storage/vercel-postgres] (last updated Jan 13 2026).
- **External DB**: fully supported; connect from Python function using standard SQLAlchemy/psycopg2/asyncpg to external Postgres (Neon, AWS RDS, etc.). No co-located (same-region embedded) managed DB from Vercel itself anymore — use Marketplace integrations.
- **Evidence**: https://vercel.com/docs/storage/vercel-postgres · https://vercel.com/marketplace?category=storage&search=postgres

## 7. MCP server status — BETA / PUBLIC BETA (verified)
- **Vercel MCP server** (`mcp.vercel.com`) is in **Public Beta** (announced in changelog; doc last updated 2026-09-15, type=integration). Provides remote interface with OAuth for AI tools to interact with Vercel projects (docs, deployments, logs).
- Implements MCP Authorization (2025-06-18 spec) + Streamable HTTP transport.
- **Status**: PUBLIC BETA — not GA.
- **Evidence**: https://vercel.com/changelog/vercels-mcp · https://vercel.com/docs/mcp · https://vercel.com/docs/agent-resources/vercel-mcp

## 8. Global CDN
- Yes — zero-config CDN; automatic HTTPS/TLS; global PoPs; fluid compute; traffic load balancing; automatic region failover; configurable routing / rewrites / middleware; image optimization; ISR; blob storage (1 GB free). Served by Vercel's edge network [vercel.com/pricing] [vercel.com/docs/cdn].
- **Evidence**: https://vercel.com/pricing / Network section

## 9. Gotchas for FastAPI on Vercel (factual)
- **No persistent process**: file uploads processed in-memory must complete within max duration; large file processing may need external worker (e.g., Render / AWS Lambda + SQS).
- **Cold start / bundle**: Python bundle 500 MB max; include only needed deps; use `pyproject.toml` / `requirements.txt`; build command configurable via `[tool.vercel.scripts] build`.
- **Entrypoint exact**: instance must be named `app`; module path must match `entrypoint`. Project root is working dir, not file dir.
- **Static files / CDN promotion**: `app.mount()` / `StaticFiles()` promoted to CDN at build time; use `exclude = true` to serve only from CDN and not include in function bundle.
- **ASGI streaming supported**: Vercel Functions support response streaming (good for FastAPI streaming responses / AI SDK streaming).
- **No native WebSocket server inside function**; use Edge for WS or external service.
- **DB connections**: open/close per invocation or use connection pooling (e.g., SQLAlchemy pool); don't assume persistent DB socket.
- **No background tasks** inside request handler — offload to queue / cron.
- **Evidence**: https://vercel.com/docs/frameworks/backend/fastapi · https://vercel.com/kb/guide/ship-a-fastapi-app-on-vercel

---
Quick verdict for this project (anonimizator / Polish law-office anonymizer):
- **Good for**: FastAPI API + static Chrome extension assets served via CDN; quick deploys; zero-config; free Hobby tier.
- **Not good for**: long-running PDF anonymization workers (timeout 300 s cap); persistent WebSocket updates; co-located DB (use Neon via Marketplace); background processing (needs Render/Render worker or external job queue — aligns with current target deploy Render).
