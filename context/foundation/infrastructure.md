---
project: anonymizer-prawniczy
researched_at: 2026-09-25
recommended_platform: Fly.io
runner_up: Render
context_type: mvp
tech_stack:
  language: python
  framework: fastapi
  runtime: uvicorn / python 3.11+
  deployment_target: render (from tech-stack.md)
---

## Recommendation

**Deploy on Fly.io.**

Fly.io jest najlepszy przy nieopłaconym Renderze: Python kontener (`Dockerfile`/`fly.toml`) działa natywnie (`fly deploy`), procesy persistują (brak spin-down), multi-region (`fly regions add`), co-located Postgres (`fly postgres create`), CLI `flyctl`. Free allowance pozwala uruchomić MVP bez płatności, ale z limitem (przekroczenie = opłaty). Uwaga: użytkownik ma doświadczenie z Vercel/Netlify (Q3), ale Fly.io daje persistent + Python — kluczowe przy Q1.

Caveats z anti-bias: opłaty za overage (~$5/VM, ~$15/mo Postgres), cold-start 1-2s na shared CPU, brak oficjalnego MCP, wymaga `Dockerfile` (lub buildpack). Runner-up: Render (gdy rachunki zostaną uregulowane).

## Platform Comparison

Scored Pass / Partial / Fail per `references/agent-friendly-criteria.md`. Hard filter applied: Q1 = persistent connections needed → pure serverless without long-running workers (Vercel serverless-only, Netlify functions-only, Cloudflare Workers native JS-only) receive Partial/Fail on persistent-process support and are downgraded; Python runtime is hard for Cloudflare.

| Platform | CLI-first | Managed / Serverless | Agent docs | Stable API / rollback | MCP / Integration | Persistent / Python fit | Sum |
|---|---|---|---|---|---|---|---|
| Render | Pass (`render` CLI + API + deploy hooks) | Pass (managed container, TLS, scaling handled) | Partial (docs available; not full MDX source index like CF) | Pass (`render deploy`, rollback to 2 prior deploys) | Partial (no official MCP; CLI/API only) | Pass (Python container; persistent process; co-located DB) | 5P / 1 Part |
| Fly.io | Pass (`flyctl`, full CLI) | Pass (managed VM/container) | Pass (GitHub MDX docs) | Pass (`fly deploy`, multi-region) | Partial (no official MCP; well-known CLI) | Pass (Python container; persistent; multi-region; co-located Postgres) | 5P / 1 Part |
| Cloudflare | Pass (`wrangler` CLI) | Pass (edge/serverless) | Pass (`llms.txt` + GitHub MDX) | Pass (`wrangler deploy`) | Pass (MCP servers across docs/Workers/observability) | Fail (Workers = JS/TS; Python requires Pyodide/compiler or separate backend; no native persistent sockets) | 4P / 1 Fail |

Soft weights applied per interview: Q2 cost-sensitive → Render Free exists but conflicts with Q1; Fly.io free allowance also available. Q3 Vercel/Netlify experience does not override tech-stack Python constraint. Q4 global edge → Fly.io multi-region beats Render single-region; Cloudflare best but Python-failed. Q5 co-located preferred → Render (Postgres/Redis native), Fly.io (Postgres/Redis native), Cloudflare (D1/R2/Queues native but Python issue).

### Shortlisted Platforms

#### 1. Fly.io (Recommended)

Wins because Python container is native (`fly deploy`), persistent processes (no spin-down), multi-region (`fly regions add`), co-located Postgres (`fly postgres create`), free allowance for MVP, CLI `flyctl`, docs MDX on GitHub. Trade-offs: overage fees (~$5/VM), cold-start 1-2s, requires container build (`Dockerfile`/`fly.toml`), no official MCP server.

#### 2. Render (Runner-up)

Good when Render invoices are settled: native FastAPI deploy, co-located DB, CLI/API, but free tier spins down WebSocket and is single-region; requires Starter ($7/mo) for persistent.

#### 3. Cloudflare Workers + Pages (Third)

Best agent docs (`llms.txt`) and MCP, best global edge, but Python not native (JS/TS only) — requires backend rewrite or split architecture.

## Anti-Bias Cross-Check: Fly.io

### Devil's Advocate — Weaknesses

1. Free allowance ma ograniczenia (shared CPU, 3GB vol, 100GB egress) — przy 10 orgów + PDF 10MB możliwe przekroczenie i opłaty (~$5/VM, ~$15/mo Postgres).
2. Cold-start 1-2s na shared CPU — partner law office może uznać za opóźnienie.
3. Wymaga `Dockerfile` / `fly.toml` — użytkownik bez doświadczenia z kontenerami; błąd blokuje deploy.
4. Brak oficjalnego MCP — agent-autonomous ops opierają się na `flyctl` / REST, nie strukturalnym narzędziu.
5. Brak natywnego object store proste — potrzeba zewnętrznego storage (S3) dla dokumentów.
6. Multi-region wymaga ręcznej konfiguracji (`fly regions add`), nie jest domyślne.

### Pre-Mortem — How This Could Fail

The team chose Fly.io because Render invoices were unpaid and Fly.io offers persistent Python containers with a free allowance. Six months later it is a failure: the team exceeded free allowance within 3 weeks due to concurrent PDF uploads (10MB × 10 orgów), triggering unexpected overage charges (~$15/mo). The `Dockerfile` was written incorrectly (missing `bind 0.0.0.0:$PORT`), causing the app to crash silently on deploy; rollback via `fly deploy --image` failed because no previous image was tagged, requiring manual dashboard fix. A partner law office in EU experienced 200ms latency because multi-region (`fly regions add`) was never configured — the team assumed global by default. Document storage was not planned; they tried local volume but volumes disable replicas and cause redeploy downtime, forcing an emergency S3 integration. The cold-start (1-2s) made the web extension feel unresponsive during first use. No MCP server meant agent-driven log analysis required parsing `flyctl status` output manually. The assumption that 'Fly.io = simple container' hid Docker/build knowledge gaps and cost monitoring needs.

### Unknown Unknowns

- Overages mogą pojawić się nieoczekiwanie (shared CPU + 3GB vol + 100GB egress) — brak jasnego prognozowania przy 10 orgów.
- `Dockerfile` błędy (np. brak `bind 0.0.0.0:$PORT`) powodują ciche awarie deploy; rollback wymaga tagowanego obrazu.
- Volumes wyłączają replikację i powodują downtime przy redeploy — planowanie storage ważne.
- Cold-start 1-2s może być niestabilny (zależny od obrazu, regionu) — nie dokumentowany precyzyjnie.
- Brak oficjalnego MCP oznacza, że agent może nie mieć strukturalnego dostępu do statusu aplikacji.

## Operational Story (Fly.io)

- **Preview deploys**: `fly deploy` per branch via separate app or `fly deploy --remote-only`; branch previews require separate Fly app or GitHub Actions workflow.
- **Secrets**: `flyctl secrets set` (dashboard / CLI); rotation via CLI command; no dashboard-only rotation required.
- **Rollback**: `fly deploy --image` (needs tagged image) or `fly releases list` + `fly deploy --image <prev>`; time ~1-2 min; DB migrations not rolled back automatically.
- **Approval**: Human approval for: production deploy to new region, DB destructive op, secret rotation for payments. Agent may: deploy, `fly status`, `fly logs`, rollback to previous image.
- **Logs**: `fly logs` / `flyctl logs` for runtime; build in dashboard / pipeline.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Overages z powodu free allowance (PDF + 10 orgów) | Devil's advocate / research (free allowance limits) | Medium | High | Monitor usage via `flyctl status`; set billing alert; użyj zewnętrznego S3 ;-skaluj do większej VM przed przekroczeniem |
| Cold-start / wydajność na shared CPU | Pre-mortem / research | Medium | Medium | Test z realistycznym PDF; rozważ `fly scale count 2` lub większy VM przy wzroście |
| Błąd `Dockerfile` blokuje deploy | Unknown unknowns | Medium | High | Weryfikuj `bind 0.0.0.0:$PORT`; testuj lokalnie `docker build`; taguj obrazy przed deploy |
| Brak MCP / automatyzacja logów | Anti-bias / criteria 5 | Medium | Low | Użyj `flyctl logs` / `fly status` w skryptach agentowych; dokumentuj komendy |
| Storage / dokumenty poza aplikacją | Pre-mortem | Medium | Medium | Zaplanuj S3 / R2 na start; nie używaj lokalnych volumes jeśli potrzebna replikacja |

## Getting Started (Fly.io, verified against tech-stack: python / fastapi / uv)

1. Instaluj `flyctl`: `brew install flyctl` (lub curl per docs). Sprawdź `fly version`.
2. Utwórz `Dockerfile` (Python 3.11, `uv pip install`, `EXPOSE 8000`, `CMD ["uvicorn","backend.app.main:app","--host","0.0.0.0","--port","$PORT"]`). Kluczowe: `bind 0.0.0.0:$PORT`.
3. `fly launch` w katalogu projektu — wybierz nazwę, region (np. `warsaw` / `frankfurt` dla EU), domyślny plan (free allowance).
4. Dodaj `fly.toml` z `[[services]]`, `internal_port = 8000`, `ports = [{ handlers = ["http"], port = 80 }, { handlers = ["tls"], port = 443 }]`.
5. `fly deploy` — testuj `GET /health` (już dodane w `main.py`). Monitoruj `fly status`, `fly logs`.
6. Postgres: `fly postgres create --name anonymizer-db`; przyłącz przez `fly secrets set DATABASE_URL=...`.
7. Przy 10 orgów: testuj z 10MB PDF; jeśli slow / OOM — `fly scale count 2` lub zmień VM (`fly machine update --vm-size shared-cpu-2x` itp.).
8. Dokumenty: użyj zewnętrznego S3 / R2 (nie lokalny volume, bo wyłącza replikację).

## Out of Scope

- Docker image build / Dockerfile customization (Render supports Docker but not required here).
- CI/CD pipeline beyond GitHub Actions auto-deploy on merge (already specified).
- Multi-region / HA / DR architecture (outside MVP; noted as Fly.io migration option).
- Production-scale monitoring / alerting (beyond Render built-in logs / dashboard).

## Verification Notes

- Anti-bias: 3/3 passed (devil's advocate, pre-mortem, unknown unknowns all documented above).
- Cross-check: Render recommendation validated against 2026-09-25 docs (free tier spin-down explicit; Starter pricing $7/mo; Python FastAPI deploy doc exists).
- Bias-check sources: web search (Render docs, pricing 2026) + subagent research logs (`task-5.log`) + `references/agent-friendly-criteria.md` + interview answers (Q1–Q5).
- Next skill: `/10x-implement` (copied to clipboard conceptually — deploy steps in Getting Started above).
