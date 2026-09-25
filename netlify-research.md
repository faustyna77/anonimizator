# Netlify — MVP deployment research (FastAPI / Python)

Research date: 2026-09-25. For anonimizator project (FastAPI backend, target deploy currently Render).

## Verdict: poor fit for this FastAPI backend
Netlify is a frontend/JAMstack + serverless platform, NOT a persistent Python app host. Its functions layer is JS/Go only (no native Python). A FastAPI app needs a persistent worker (long-lived, WebSocket-capable, DB connection pool) — Netlify's model contradicts that. Keep Render or pivot to a platform with Python persistent services (Render, Railway, Fly, DigitalOcean App Platform).

---

## 1. Python serverless functions support — NO (official)
- Supported runtimes for Netlify Functions: **TypeScript / JavaScript and Go** (per docs.netlify.com/build/functions/overview/ and forum answers).
- Python is **not** a supported function language. Open feature request exists but unfulfilled.
- Netlify Functions are AWS Lambda wrappers (ephemeral, short-lived). Even if you package a FastAPI app with a Python Lambda adapter (e.g., mangum/awsgi behind a JS proxy), it is a workaround, not native support — and still hits execution-time / connection limits.
- Edge Functions are Deno/TS/JS only (not Python).
- Link: https://docs.netlify.com/build/functions/overview/ ; https://answers.netlify.com/t/python-lambda-functions/3423

## 2. Netlify CLI
- Official: `npm install -g netlify-cli` (Node 22.13+); homebrew `brew install netlify-cli`; local install `npm install --save-dev netlify-cli`.
- Commands: `netlify init`, `netlify deploy`, `netlify dev`, `netlify functions:create/invoke`, `netlify env:set`, `netlify open:site`.
- Link: https://cli.netlify.com/ ; https://developers.netlify.com/cli ; https://github.com/netlify/cli

## 3. Docs
- Main doc index (with `.md` append to get markdown): https://docs.netlify.com/ ; LLM index: https://docs.netlify.com/llms.txt
- Functions overview: https://docs.netlify.com/build/functions/overview/
- CLI guide: https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli.md
- Netlify vs Render comparison (relevant): https://www.netlify.com/knowledge-base/netlify-vs-render/

## 4. Free tier / cost (credit-based, 2026)
- Plan: **Free = $0** / Personal $9/mo / Pro $20/mo + credit tiers (3k–20k/mo) / Enterprise custom.
- Free limits (credit pool): **300 usage credits/month**, 1 concurrent build, 125k serverless function requests/mo, 100 GB CDN bandwidth/mo (older figure; now credit-based for build + deploy + compute + bandwidth + AI inference).
- Paid adds smart secret detection, longer analytics retention, priority support, auto-recharge option.
- Note: overages/pauses — when credits exhaust, site pauses until next cycle (unless auto-recharge on paid).
- Pricing page: https://www.netlify.com/pricing/ ; comparison: https://www.netlify.com/pricing/personal-vs-free/

## 5. Persistent connections / long workers — NOT SUPPORTED (major gotcha)
- Netlify Functions are **stateless / ephemeral / short-lived** (execution time capped, no long-running process).
- No native WebSocket / long-lived connections; comparison page explicitly says: "Realtime / WebSockets — Not designed for long-lived connections" vs Render.
- No persistent DB connection pool inside a function; you must connect/disconnect per invocation (or use external managed DB).
- Background jobs / long workers: only via external workers or Netlify's newer background-workload primitives (not the classic Functions). For a backend that needs a running uvicorn server, this is a deal-breaker.
- Link: https://www.netlify.com/knowledge-base/netlify-vs-render/ ; https://kuberns.com/blogs/can-you-deploy-backend-on-netlify/ ; https://www.netlify.com/blog/web-sockets-in-a-serverless-world/

## 6. Co-located services — Netlify Database (Postgres via Neon partner)
- Netlify Database = fully managed **Postgres**, powered by **Neon** (partnership). GA April 2026; 400k+ DBs created.
- Integrated into Netlify workflow: DB branches per deploy preview / agent run, automatic env vars, migrations, backups, agent-runner integration (Drizzle/ORM friendly).
- Also partners: **Supabase** (Postgres) and **Nile** (multi-tenant serverless Postgres) listed as supported integrations.
- Consumes compute/bandwidth credits; storage free until 2026-07-01 per earlier announcement.
- Link: https://www.netlify.com/blog/netlify-database/ ; https://battlemaps.io/intel/6f5d6fed-231e-4a2f-8e02-e61f21f15125 ; https://chatgate.ai/post/netlify-database

## 7. MCP server — OFFICIAL
- Netlify launched official **MCP Server** June 3 2025 (Anthropic Model Context Protocol). Repo: https://github.com/netlify/netlify-mcp
- Enables AI agents (Cursor, Windsurf, Claude, Copilot, Cline) to create/deploy/manage Netlify projects, install extensions (Auth0, Supabase), manage env vars/secrets, debug deploy logs — all via natural language.
- Config example: `npx -y @netlify/mcp` inside `mcp.json`. Remote hosted server also available.
- Link: https://www.netlify.com/press/netlify-launches-official-mcp-server-setting-the-standard-for-agent-native-development ; https://github.com/netlify/netlify-mcp ; https://mcpservers.org/servers/netlify/netlify-mcp

## 8. Global CDN / edge
- **Netlify Edge**: global network (~70 PoPs via Fastly). Atomic deploys, instant cache invalidation, custom domains + SSL, deploy previews per branch/PR.
- **Edge Functions**: Deno-based, run at edge, near-zero cold start; for rewrites, auth, A/B, geo-routing. Not Python.
- Each deploy gets immutable URL (`netlify.app` subdomain); rollback = pointer swap.
- Link: https://www.netlify.com/platform/core/edge ; https://docs.netlify.com/edge-functions/overview/

## 9. Key gotchas / why not for this FastAPI project
1. **No Python runtime for Functions** — FastAPI cannot run natively.
2. **No persistent server / long worker** — uvicorn needs a continuous process; Netlify kills after timeout (max ~26 sec function execution reported for Netlify; rebuild per request).
3. **Stateless** — no in-memory state between requests; DB connection must be re-established or use external pool.
4. **Not a container / app service** — no `docker run` equivalent; you deploy static assets + JS/Go functions.
5. **Credits, not flat usage** — 300/mo free, then site pauses; can surprise for demo/per-demo traffic.
6. **Functions != App server** — to serve a FastAPI app you'd need either (a) external persistent host + Netlify as frontend proxy, or (b) a Lambda adapter wrapper (mangum) behind a JS entry — both over-engineered vs Render.
7. **MCP is a plus** if using AI agents, but doesn't change runtime constraints.

---

## Bottom line for project
- **Keep Render** (already configured in AGENTS.md) for FastAPI backend: persistent services, native Python, WebSocket-ready, simple deploy.
- **Netlify fits only** if you split architecture: Netlify hosts static frontend / Edge Functions / CDN; backend stays on Render / Railway / Fly / AWS Elastic Beanstalk / DigitalOcean Apps.
- If forced to use Netlify for backend: consider **Netlify + external FastAPI host** (proxy via redirect/rewrite rules) OR deploy FastAPI via a container service (Render/Railway) and point domain to Netlify for static assets.

Sources verified / links collected during research; all above URLs accessible 2026-09-25.
