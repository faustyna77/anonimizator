---
starter_id: fastapi
package_manager: uv
project_name: anonymizer-prawniczy
hints:
  language_family: python
  team_size: solo
  deployment_target: render
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

Backend API dla pilotażu 1–10 kancelarii ma istniejący punkt startowy w FastAPI, a produkt wymaga logowania, przetwarzania dokumentów oraz integracji z rozszerzeniem Chrome. FastAPI zapewnia jawne modele Pydantic, automatyczne OpenAPI i dobrą obsługę API w Pythonie; spełnia cztery kryteria przyjazności dla agentów. Render jest wybranym środowiskiem dla FastAPI, Supabase zapewnia zarządzany PostgreSQL, uwierzytelnianie i — jeśli będzie potrzebne — storage, a Cloudflare Pages będzie hostować panel kancelarii zbudowany jako frontend React. GitHub Actions będzie uruchamiać kontrolę jakości i automatycznie wdrażać zmiany po scaleniu do main. Rejestr 10x oznacza wsparcie bootstrappingu FastAPI jako first-class: powinno przebiec w większości płynnie, lecz nie jest zweryfikowane end-to-end.