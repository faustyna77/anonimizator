# Zabezpiecz trasy produktu dla F-01 — brief planu

> Pełny plan: `context/changes/minimal-document-access/plan.md`

## What & Why

F-01 ustanawia minimalną granicę dostępu dla kancelarii przed wdrożeniem anonimizacji dokumentów i panelu reguł. Supabase Auth uwierzytelnia użytkownika, a PostgreSQL na Fly.io przechowuje profil i jedną automatycznie utworzoną kancelarię; backend wyprowadza ją z zweryfikowanej tożsamości, nie z danych klienta.

## Starting Point

Backend ma publiczny stub `/anonymize` oraz globalny CORS, bez auth, danych i testów. Panel i rozszerzenie wysyłają anonimowe żądania; F-01 obejmuje panel, ale pozostawia rozszerzenie dla S-02.

## Desired End State

Panel pozwala zarejestrować konto, zalogować się e-mailem i hasłem, odtworzyć sesję i wylogować. `/health` pozostaje publiczne, a trasy produktu wymagają zweryfikowanego tokenu i kontekstu jednej kancelarii, zwracając 401 lub 403 bez ujawniania cudzych danych.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Dostawca tożsamości | Supabase Auth z e-mailem i hasłem | Jest zgodny z istniejącym wyborem stosu i nie wymaga własnego systemu haseł. |
| Dane kancelarii | PostgreSQL na Fly.io | Dane aplikacyjne pozostają przy wdrożonym backendzie, niezależnie od dostawcy Auth. |
| Model kancelarii | Jedna kancelaria na konto | Ogranicza MVP do prostego, jednoznacznego modelu własności danych. |
| Rejestracja | Pierwsze uwierzytelnione wywołanie tworzy kancelarię | Backend atomowo tworzy profil i kancelarię bez zaufania danym klienta. |
| Ochrona tras | `/health` publiczne, trasy produktu chronione | Monitoring działa bez konta, a dokumenty i reguły nie trafiają do publicznego API. |
| Zakres klientów | Panel teraz, rozszerzenie w S-02 | F-01 tworzy kontrakt bezpieczeństwa bez przejmowania przepływu rozszerzenia. |
| Granica F-01 | Tożsamość i ochrona tras, bez dokumentów | S-01 zachowuje odpowiedzialność za pierwszy pełny przepływ anonimizacji. |
| Deploy panelu | Istniejący Fly jest kanoniczny dla F-01 | Obecny CI wdraża panel na Fly, więc publiczna konfiguracja Vite musi być dostarczona podczas tego buildu. |

## Scope

**In scope:**
- Supabase Auth oraz profil i jedna kancelaria na użytkownika w PostgreSQL na Fly.io.
- Serwerowa weryfikacja tokenu, zaufany kontekst kancelarii oraz 401/403.
- Ograniczony CORS i bezpieczna powierzchnia tras produktu.
- `/health` publiczne oraz dokumentacja API dostępna lokalnie, a wyłączona w produkcji.
- Rejestracja, logowanie, odtworzenie sesji i wylogowanie w panelu.
- Build panelu Fly z publiczną konfiguracją Auth/API i bez sekretów w artefakcie.
- Automatyczne i ręczne testy granicy dostępu.

**Out of scope:**
- Przechowywanie lub anonimizacja dokumentów.
- CRUD reguł i słowników.
- Logowanie lub transfer plików w rozszerzeniu Chrome.
- Wielokancelaryjność, role zespołowe i zaproszenia.
- Migracja hostingu lub wdrożenie sekretów produkcyjnych.

## Architecture / Approach

Supabase tworzy konto, a backend po zweryfikowaniu tokenu atomowo tworzy lub odczytuje relację konto → kancelaria w PostgreSQL na Fly. Panel utrzymuje sesję Supabase i dołącza token do wywołań produktu. Backend przekazuje zaufany kontekst handlerom; przyszłe slice’y użyją go dla dokumentów i reguł. Dla F-01 istniejący deploy panelu Fly buduje źródła z wyłącznie publicznymi wartościami `VITE_*`.

## Regression-test boundary

Testy auth zastępują dostawcę Supabase kontrolowanymi odpowiedziami i nie łączą się z prawdziwym projektem Auth. Integracja migracyjna używa wyłącznie `TEST_DATABASE_URL` wskazującego PostgreSQL z nazwą bazy zakończoną na `_test`; uruchamia Alembic, a następnie czyści tabele testowe. Testy potwierdzają publiczny `/health`, 401, 403, odizolowane konteksty dwóch kancelarii i ignorowanie `office_id` przesłanego przez klienta. Szczegóły uruchomienia znajdują się w `docs/environment.md`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Tożsamość i kancelaria | Konto Auth, profil i kancelaria w PostgreSQL oraz działający build panelu | Niepoprawne przypisanie konta albo brak połączenia z bazą Fly. |
| 2. Serwerowa ochrona tras | Tokeny, kontekst kancelarii, 401/403 i CORS | Zaufanie danym klienta lub nadmiernie szeroki CORS. |
| 3. Panel logowania i sesja | Rejestracja, logowanie, sesja i wylogowanie | Niespójna obsługa wygaśniętej sesji. |
| 4. Weryfikacja granicy dostępu | Testy regresji i dokumentacja konfiguracji | Brak testów niezależnych od produkcyjnego Auth. |

**Prerequisites:** testowy projekt Supabase, lokalna lub testowa PostgreSQL oraz lokalnie dostępne publiczne i serwerowe zmienne środowiskowe.
**Estimated effort:** cztery fazy; bez estymacji kalendarzowej.

## Open Risks & Assumptions

- Projekt Supabase, PostgreSQL na Fly oraz ich dane dostępu nie są jeszcze podłączone do repozytorium; plan zakłada testowe konfiguracje poza repo.
- Dostęp istniejącego rozszerzenia zostanie celowo odrzucony przez chronione `/anonymize` do czasu S-02.
- Rozbieżność dokumentacji środowiska wdrożeniowego nie zmienia kontraktu F-01 i pozostaje poza zakresem.
- F-01 utrzymuje Fly jako bieżący sposób dostarczania panelu; ewentualna migracja hostingu pozostaje osobną zmianą.
- Narzędzie migracyjne backendu i testowa PostgreSQL są wymagane do walidacji schematu przed wdrożeniem na Fly.

## Success Criteria (Summary)

- Nowa rejestracja tworzy dokładnie jedną kancelarię, a inne konto nie może użyć jej kontekstu.
- `/health` działa anonimowo, a trasy produktu odrzucają brakujący lub niewłaściwy dostęp kontrolowanymi 401/403.
- Panel pozwala zarejestrować się, zalogować, odtworzyć sesję i wylogować bez anonimowych wywołań produktu.
