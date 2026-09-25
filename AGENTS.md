# AGENTS.md — anonimizator (anonymizer-prawniczy)

FastAPI backend (`backend/app/main.py`) + Chrome extension (`chrome-extension/`) + `src/anonymizer_prawniczy/`. Project scaffolded via 10x-bootstrapper (M1L3) from `context/foundation/tech-stack.md` (starter: fastapi, uv, native-cwd). Legal-doc anonymizer for Polish law offices (kancelarie prawne); target deploy Render.

## Conventions observed
- FastAPI app instance named `app` in `backend/app/main.py`; module path `backend.app.main:app`.
- `pyproject.toml` uses `uv_build`; `package_manager` = uv per tech-stack.
- Chrome extension: manifest v3 (`chrome-extension/manifest.json`), permissions `activeTab` + `storage`, host `<all_urls>`.
- `context/changes/bootstrap-verification/verification.md` records audit (0 findings / 41 deps). Do not delete.

## Dev environment
- Python >=3.11 (`pyproject.toml` / `.python-version` = 3.11-era).
- `.venv/` exists (already has `fastapi`, `uvicorn`). Do NOT edit `.venv/` by hand.
- Extra backend deps: `pdfplumber`, `python-docx` (`backend/requirements.txt`).
- Setup (verified): `python3 -m venv .venv` then `.venv/bin/pip install -r backend/requirements.txt` (or reuse existing `.venv`).
- Context source of truth: `context/foundation/tech-stack.md`, `prd.md`, `shape-notes.md`. Never overwrite `context/`.

## Build / test / lint
- No `tests/`, `Makefile`, `tox.ini`, `.github/workflows/` found. No test script exists.
- No lint / format config (`ruff.toml`, `.pylintrc`, etc.).
- Run server (verified from `main.py`): `.venv/bin/uvicorn backend.app.main:app --reload --port 8000`
- Project entry script (from `pyproject.toml`): `anonymizer-prawniczy = "anonymizer_prawniczy:main"` — module `src/anonymizer_prawniczy/` currently empty except `__init__.py`.

## Pitfalls
- `.venv/` pre-built; `uv` CLI may fail in background (PATH issue observed — use `.venv/bin/` directly or `python3 -m venv`).
- `backend/app/main.py` only defines `app = FastAPI()`; no routes yet — don't assume API is complete.
- `src/anonymizer_prawniczy/` is scaffold-only (`__init__.py` only); core anonymization logic not implemented.
- `README.md` is stub (`# anonimizator`); do not rely on it for commands.
- `CLAUDE.md` (course notes, 13KB) is present for lesson context; `AGENTS.md` (this file) is for agent work in repo.
