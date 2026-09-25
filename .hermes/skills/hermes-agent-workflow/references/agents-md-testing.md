# AGENTS.md rule testing (practical)

Add / edit rule in `AGENTS.md`; verify with command, not chat.

Cases for this project (from `AGENTS.md` lines 5, 6, 24+):

1. App instance name = `app`
   Prompt: "Dodaj endpoint @app.get('/test') w backend/app/main.py, nie zmieniaj nazwy instancji."
   Verify: `grep -n "app = FastAPI" backend/app/main.py`

2. Module path `backend.app.main:app`
   Prompt: "Uruchom serwer zgodnie z AGENTS.md."
   Verify: `.venv/bin/uvicorn backend.app.main:app --port 8000` (line 15 reference)

3. `.venv/` only via `.venv/bin/`, never manual edit
   Prompt: "Zainstaluj pdfplumber zgodnie z regułą .venv."
   Verify: command uses `.venv/bin/pip` not `sudo pip` / system pip.

4. Ordering check (post-edit)
   After moving `## Conventions` to top (line 5): verify with `grep -n "^## " AGENTS.md` — conventions should appear before Dev environment.

Rule: test ONE change per session; include rule reference explicitly in prompt for strict verification.
