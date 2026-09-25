# Testing agent rules after editing AGENTS.md

Use after any change to a rules file (order, new rule, removal).
One representative task per session — do not batch structural changes.

## Pattern
1. Edit rules file (e.g., AGENTS.md) — atomically, preserve bytes.
2. Give agent ONE task that uses / violates the changed rule.
3. Verify with `grep` / `cat` / server start, not by reading chat only.

## Cases (this project: FastAPI + AGENTS.md conventions)

### A. Convention — instance name `app`
Prompt: `"In backend/app/main.py add @app.get('/test'), keep instance named app."`
Check: `grep -n "app = FastAPI" backend/app/main.py`
Pass: line still says `app`; fail: renamed to `api`, `application`.

### B. Module path — `backend.app.main:app`
Prompt: `"Start server using the correct module path from AGENTS.md."`
Check: `.venv/bin/uvicorn backend.app.main:app --port 8000`
Pass: server starts; fail: agent invents `main:app` or new file.

### C. Pitfall — `.venv/` only via `.venv/bin/`
Prompt: `"Install pdfplumber correctly per AGENTS.md .venv rule."`
Check: command contains `.venv/bin/pip` (not bare `pip` / `sudo pip`).

## Safety rule
- Save file first (`write_file` / Ctrl+S). Current-session agent may not reload it; include rule reference in your prompt if strict.
- Do NOT run `npx @przeprogramowani/10x-cli` inside Hermes — that pulls Claude-Code `.claude/` templates, not Hermes skills. If `.claude/` appeared from it, ignore or delete; use `.hermes/skills/` instead.
- One change per session. Test it before next edit (ordering, split, new rule).
