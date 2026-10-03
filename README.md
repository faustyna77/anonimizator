# anonimizator

## F-01: minimalna granica dostępu

F-01 zapewnia logowanie panelu przez Supabase Auth oraz zaufany kontekst jednej kancelarii dla każdego zweryfikowanego użytkownika. Backend wyprowadza `office_id` wyłącznie z relacji `profiles.user_id → profiles.office_id` w PostgreSQL. Klient nie wybiera kancelarii i przesłane przez niego `office_id` nie stanowi podstawy autoryzacji.

Publiczny pozostaje tylko `GET /health`. Trasy produktu, w tym `POST /anonymize`, wymagają tokenu bearer i zwracają 401 dla brakującego albo nieważnego tokenu oraz 403, gdy serwer nie może uzyskać kontekstu kancelarii. Szczegóły zmiennych środowiskowych i wdrożenia opisuje [docs/environment.md](docs/environment.md).

### Lokalna weryfikacja regresji

Zainstaluj zależności deweloperskie i uruchom testy z oddzielną lokalną/testową PostgreSQL. Zmienna musi wskazywać bazę, której nazwa kończy się na `_test`; test fixture uruchamia migracje Alembic i czyści wyłącznie tę bazę. Testy zastępują integrację Supabase kontrolowanym dostawcą, więc nie łączą się z projektem Auth ani z bazą Fly.

```bash
.venv/bin/pip install -r backend/requirements-dev.txt
TEST_DATABASE_URL='postgresql+psycopg://postgres:postgres@localhost:5432/anonimizator_test' \
  .venv/bin/pytest
```

Panelowe testy kontraktu, lint i build uruchamia się z katalogu `frontend/` wyłącznie z publicznymi zmiennymi `VITE_*`:

```bash
npm test
npm run lint
npm run build
```

### Poza zakresem F-01

F-01 nie dodaje przechowywania, pobierania ani anonimizacji dokumentów. Nie zmienia też uwierzytelniania rozszerzenia Chrome ani transferu plików z rozszerzenia; te elementy należą odpowiednio do S-01 i S-02. S-01 i S-03 mają wykorzystywać istniejącą zależność `get_current_access_context`, bez dodawania drugiego mechanizmu uwierzytelniania.
