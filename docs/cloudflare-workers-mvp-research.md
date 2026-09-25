CLOUDFLARE WORKERS + PAGES — PYTHON FASTAPI MVP TARGET — checked 2026-09-25

(1) PYTHON RUNTIME — Workers: Python 3.12 via workers-sdk / pyodide (WASM); Pages Functions: JS/TS/WASM only (no native Python). FastAPI must re-architect: ASGI/uvicorn unsupported; use Workers Python entry with starlette-style routing or FastAPI+pyodide custom entry. Limitation: no persistent process, cold-start ~ms, no long-lived state. Docs: https://developers.cloudflare.com/workers/runtime-apis/python/

(2) WRANGLER CLI — deploy: wrangler deploy / wrangler pages deploy; rollback: wrangler rollback [env]; logs: wrangler tail / dashboard. CLI docs: https://developers.cloudflare.com/workers/wrangler/ . Works; needs CLOUDFLARE_API_TOKEN auth.

(3) DOCS AVAILABILITY — GitHub cloudflare/workers-sdk has docs/ (markdown); no clean llms.txt at root (some sub-repos have docs/). Canonical = developers.cloudflare.com; no single md dump. Python examples at github.com/cloudflare/workers-sdk/tree/main/packages/workers-sdk.

(4) PRICING (low scale) — Workers free: 100k req/day, 10ms CPU, 1GB; Pro $5/mo + usage (~$0.12/million req + $0.12/GB). Pages free: 100 build/min; Pro $20. D1 free 5GB/100k/day; R2 free 10GB. MVP fits free tier. https://www.cloudflare.com/plans/

(5) PERSISTENT CONNECTIONS / WEBSOCKETS / DURABLE OBJECTS — WebSockets: GA (2021). Durable Objects: GA (2022) — stateful, colocation, WebSocket upgrade; required for persistent sessions. Status CONFIRMED GA 2026-09-25. Non-GA/preview at check: Workers AI (beta); Queue producers (GA 2024). No preview blocking MVP if DOs used.

(6) CO-LOCATED DB / STORAGE — D1 (SQLite, GA), R2 (S3-compatible, GA), Queues (GA), KV (GA). Bind via wrangler.toml / Workers bindings. D1 driver exists (d1-python / workers-sdk); SQLAlchemy possible but via binding not TCP pool. No native Postgres — must use D1 or external (Supabase/Neon) losing co-location.

(7) MCP / AGENT INTEGRATIONS — No official Cloudflare MCP server listed. No workers-sdk MCP endpoint found; deploy is CLI-driven (wrangler). Third-party unverified. For MVP: CLI deploy, not agent-native; expose REST/Workers endpoints for agent use.

(8) FASTAPI GOTCHAS — (a) ASGI/uvicorn unsupported — port routes or use pyodide. (b) No persistent DB TCP pool — D1 binding only. (c) Ephemeral FS — use R2 for files. (d) Request timeouts 50ms (free) / 30s (paid) — long PDF anonymization may hit; split or Queue. (e) No background tasks — use Queues/DO. (f) Dependencies must be pure-Python / WASM-compatible; pdfplumber / python-docx native extensions must be tested in workers-sdk env. (g) Pages + Python = not supported — use Workers (not Pages).

VERDICT FOR anonymizer-prawniczy: feasible as Workers (not Pages) with Python 3.12 entry, D1+R2, DO for persistence, Queue for long jobs. If unchanged native FastAPI/uvicorn needed, Render stays simpler — Workers require re-port.
