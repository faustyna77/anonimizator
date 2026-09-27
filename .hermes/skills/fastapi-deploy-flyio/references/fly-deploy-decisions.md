---
decision-table: fly.io free-tier vs render for fastapi mvp
reference: context/foundation/infrastructure.md (2026-09-25)
applicable-when: deploying python/fastapi to fly.io; region selection; ip/certificate setup
---

| Step | Fly.io (chosen) | Render (runner-up) | Note |
|---|---|---|---|
| Persistent Python | Pass (VM, no spin-down) | Partial (free spin-down) | Infrastructure.md Q1 |
| Region EU | ams (verified available) | Single-region default | User dashboard confirms |
| IP / .fly.dev | Requires `flyctl ips allocate-v4/v6` | Auto | Pitfall captured |
| Secrets | CLI `flyctl secrets set` | Dashboard / CLI | Never repo |
| DB co-located | `fly mpg create` (managed) | Render Postgres | Use managed, not unmanaged |
| Build fix | `requirements.txt` COPY path | N/A | Real build error fixed |
| CI | `.github/workflows/fly.yml` | Render deploy hook | Both work |
| Cost watch | Free allowance + billing alert | Starter $7/mo for persistent | Pre-mortem risk |

Pitfall shorthand: bind 0.0.0.0 + allocate IPs + expect cold-start.
