<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Zarządzanie regułami anonimizacji kancelarii

- **Plan**: `context/changes/office-rules-management/plan.md`
- **Scope**: Phase 3 of 3
- **Reviewed phases**: 3
- **Date**: 2026-10-12
- **Verdict**: REJECTED
- **Findings**: 2 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — Stare odpowiedzi API mogą ujawnić reguły poprzedniej kancelarii

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — stawka architektoniczna; wymaga świadomej decyzji
- **Dimension**: Safety & Quality
- **Location**: `frontend/src/App.jsx:144-176,266-275`
- **Detail**: `loadOfficeRules()` i `loadDocuments()` zapisują zakończone odpowiedzi bez sprawdzenia, czy sesja nadal jest tą samą sesją. Żądanie kancelarii A może zakończyć się po wylogowaniu i zalogowaniu kancelarii B, zapisując dane A w panelu B. Błąd 401 ze starego żądania może również wylogować nową sesję. Takie same niechronione przeładowania następują po zapisie i usunięciu reguły.
- **Fix**: Powiązać wszystkie asynchroniczne odczyty i mutacje z generacją sesji albo anulować je przez `AbortController`; ignorować sukcesy i błędy należące do nieaktualnej sesji.
  - Strength: Eliminuje klasę wycieku danych między kancelariami.
  - Tradeoff: Wymaga centralnej koordynacji stanu asynchronicznego.
  - Confidence: HIGH — bieżący kod bezwarunkowo wywołuje setState po await.
  - Blind spot: Brak obecnego testu DOM z opóźnioną odpowiedzią.
- **Decision**: FIXED — request generation jest aktualizowana przy każdej zmianie tokenu i rozpoczęciu wylogowania; odczyty, mutacje, upload oraz download ignorują zakończenia nieaktualnej sesji. Dodano regresję helpera w `frontend/src/request-generation.test.js`.

### F2 — Zmiana kancelarii może pozostawić dane interfejsu poprzedniej kancelarii

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — stawka architektoniczna; wymaga świadomej decyzji
- **Dimension**: Safety & Quality
- **Location**: `frontend/src/App.jsx:35-43,119-134,144-156`
- **Detail**: Wylogowanie i 401 czyszczą listę reguł, lecz nie resetują `ruleDrafts`, więc następna kancelaria może zobaczyć niewysłaną frazę, regex lub marker poprzedniej. Gdy zdalne `signOut()` się nie powiedzie, handler tylko wyświetla błąd i pozostawia całą lokalną sesję oraz dane na ekranie. Nieistotne pomocniki `request-generation.*` i `rule-drafts.*` w worktree nie są importowane przez `App.jsx`, więc nie rozwiązują problemu.
- **Fix**: Wprowadzić jedną funkcję czyszczącą UI kancelarii i wywoływać ją dla każdej zmiany tożsamości, 401 oraz w `finally` wylogowania; zdalne wylogowanie traktować jako best-effort.
  - Strength: Chroni dane widoczne lokalnie niezależnie od awarii dostawcy Auth.
  - Tradeoff: Wymaga objęcia jednym kontraktem całego stanu zależnego od kancelarii.
  - Confidence: HIGH — aktualne ścieżki nie resetują draftów i zależą od sukcesu zdalnego wylogowania.
  - Blind spot: Brak testu A → wylogowanie → B na prawdziwym komponencie.
- **Decision**: FIXED — stan kancelarii jest czyszczony przy zmianie tożsamości użytkownika, 401 i lokalnie natychmiast po kliknięciu wylogowania; nieudane zdalne wylogowanie nie pozostawia danych na urządzeniu. Dodano test resetowania draftów w `frontend/src/rule-drafts.test.js`.

### F3 — Błędy transportu i parsowania mogą wyświetlić techniczne szczegóły

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka jest wąska i oczywista
- **Dimension**: Pattern Consistency
- **Location**: `frontend/src/api.js:23-36,78`; `frontend/src/App.jsx:144-158,232-235,256-259`
- **Detail**: Odrzucone `fetch`, błąd dostawcy tokenu albo niepoprawny JSON z odpowiedzi sukcesu omijają `ApiAccessError`. `handleProductError()` zwraca potem surowe `error.message` do komunikatu UI. To omija istniejące bezpieczne mapowanie błędów HTTP i różni się od chronionego klienta rozszerzenia.
- **Fix**: Mapować błędy tokenu, sieci i JSON na stałe `ApiAccessError`, a w UI pokazywać komunikat tylko dla znanych kodów lub bezpieczny fallback.
- **Decision**: FIXED — `createProductApi` mapuje błędy dostawcy tokenu, sieci i parsowania JSON na bezpieczny `REQUEST_FAILED`; dodano regresje dla odrzuconego żądania i niepoprawnego JSON.

### F4 — Testy CRUD nie dowodzą pełnego kontraktu błędów

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka jest wąska i oczywista
- **Dimension**: Plan Adherence
- **Location**: `frontend/src/api.test.js:112-217`
- **Detail**: Pokryto happy path wszystkich metod, 422 dla create i 404 dla delete, lecz brakuje regresji dla błędu listowania, aktualizacji, transportu i nieprawidłowego JSON. Nieśledzone testy pomocników sprawdzają tylko izolowane obiekty i nie są podłączone do panelu.
- **Fix**: Dodać testy błędów list/update oraz testy odrzuconego fetch i wadliwej odpowiedzi JSON dla rzeczywistego `createProductApi`.
- **Decision**: FIXED — dodano regresje dla listowania z 500 oraz aktualizacji z 422; wcześniejsze regresje obejmują odrzucony fetch i niepoprawny JSON.

### F5 — Ręczne kryteria akceptacyjne pozostają niepotwierdzone

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — wymaga świadomej decyzji o pozostałym ryzyku
- **Dimension**: Success Criteria
- **Location**: `context/changes/office-rules-management/plan.md:208,219`
- **Detail**: `2.4` (reguła panelu działa z rozszerzeniem bez przeładowania) i `3.3` (pełny CRUD panelu oraz wynik kolejnego uploadu) nadal mają status `[ ]`. Automatyczne bramki frontendu przechodzą: 14 testów, lint z trzema ostrzeżeniami React oraz build.
- **Fix**: Wykonać scenariusze na lokalnym lub testowym środowisku z drugą kancelarią, a dopiero potem odhaczyć Progress.
  - Strength: Zamienia założenia integracyjne w obserwowalny dowód.
  - Tradeoff: Wymaga bezpiecznej sesji testowej i ręcznego czasu.
  - Confidence: HIGH — oba punkty nadal są oczekujące w kanonicznym Progress.
  - Blind spot: Nie zweryfikowano realnej integracji rozszerzenia w tym review.
- **Decision**: PENDING
