# Panel Kancelarii UI — Plan Brief

> Full plan: `context/changes/panel-kancelarii-ui/plan.md`
> Research: `context/changes/panel-kancelarii-ui/research.md`

## What & Why

Panel Kancelarii zostanie uporządkowany jako jeden profesjonalny widok pracy: anonimizacja dokumentu będzie widoczna jako główna akcja, a reguły, historia i ręczna deanonymizacja pozostaną poniżej jako funkcje pomocnicze. Zmiana naprawia kontrakt UI, zanim zacznie poprawiać piksele: wprowadza semantyczne tokeny, lokalne komponenty i jednoznaczne stany danych.

## Starting Point

Zalogowany panel w `frontend/src/App.jsx:474-671` renderuje cztery podobne karty, a kontrolki są natywnymi elementami składanymi bezpośrednio w `App`. `frontend/src/index.css:1-51` ma lokalne zmienne CSS z wariantem dark mode, ale panel używa w swoich stylach głównie `--border`; odczyt dokumentów i reguł nie odróżnia ładowania ani błędu od stanu pustego.

## Desired End State

Użytkownik od razu rozpoznaje upload jako pierwszy krok, przy zachowaniu wszystkich dotychczasowych funkcji i gwarancji bezpieczeństwa. `Button`, `Field` i `Card` są importowalnymi prymitywami opartymi o tokeny granatowo‑łupkowe w light i dark mode. Kitchen sink dostępny wyłącznie lokalnie pokazuje siedem stanów, a zrzuty desktop/mobile oraz guard lintera zostawiają obiektywny dowód jakości.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Hierarchia widoku | Upload na górze, funkcje pomocnicze niżej | Wyróżnia główne zadanie kancelarii bez ukrywania istniejących funkcji w zakładkach. | Plan |
| Komponenty | Lokalne `Button`, `Field`, `Card` | Naprawiają brak importowalnych prymitywów bez nowej biblioteki. | Research + Plan |
| Stany danych | Loading, error z ponowieniem, empty po sukcesie | Użytkownik nie pomyli awarii lub oczekiwania z rzeczywistym brakiem danych. | Plan |
| Kierunek tokenów | Neutralny granat i łupek z dark mode | Pasuje do kontekstu kancelarii i rozszerza istniejący wariant motywu. | Plan |
| Bramka wizualna | `playwright-cli` i dev-only kitchen sink | Pokazuje wszystkie siedem stanów bez konta, danych produkcyjnych lub nowej infrastruktury E2E. | Plan |

## Scope

**In scope:**

- Tokeny UI w `frontend/src/index.css` i ich dokumentacja w folderze zmiany.
- Importowalne lokalne `Button`, `Field` i `Card`.
- Hierarchia jednego zalogowanego Panelu Kancelarii.
- Rozdzielenie loading/error/empty dla dokumentów i reguł z ponowieniem.
- Dev-only kitchen sink, zrzuty desktop/mobile, skan literałów i reguła UI w `CLAUDE.md`.

**Out of scope:**

- Backend, API, auth, router, nowa biblioteka UI i testy E2E.
- Zmiana ręcznego oraz nietrwałego przepływu deanonymizacji.
- Rebranding pozostałych ekranów, clipboard, trwałe przechowywanie tekstu AI i snapshot testing.

## Architecture / Approach

`index.css` pozostanie jednym źródłem surowych wartości, a komponenty w `frontend/src/components/ui/` będą korzystały wyłącznie z jego ról semantycznych. `App` zachowa stan sesji, API i ochronę przed spóźnionymi odpowiedziami, lecz będzie komponował uporządkowany widok z prymitywów. Osobny model resource state rozdzieli odczyty, a wejście `import.meta.env.DEV` uruchomi kitchen sink poza buildem produkcyjnym.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Środowisko i guard UI | Skan literałów, npm guard i instrukcja `playwright-cli` | Guard nie może skanować pliku tokenów ani wprowadzić zależności produkcyjnej. |
| 2. Semantyczne tokeny panelu | Role granatowo‑łupkowe dla light/dark i dokument tokenów | Tokeny muszą zachować czytelność focus/disabled/error w obu motywach. |
| 3. Widok i prymitywy | `Button`/`Field`/`Card` oraz hierarchia uploadu | Refaktor nie może naruszyć ról a11y, auth ani czyszczenia stanu kancelarii. |
| 4. Stany i bramka | Resource state, kitchen sink, zrzuty i reguła agenta | Kitchen sink musi zostać niedostępny w produkcji. |

**Prerequisites:** Node/npm, istniejący frontend i jednorazowa lokalna instalacja `@playwright/cli` przed zrzutami.
**Estimated effort:** ~2–3 sesje implementacyjne w 4 fazach, z ręczną kontrolą po każdej fazie.

## Open Risks & Assumptions

- Repo nie ma zatwierdzonego wzorca wizualnego; decyzja granatowo‑łupkowa jest kontraktem tej zmiany, nie całej marki.
- Produkcyjny hosting głębokich URL-i nie jest badany, ponieważ kitchen sink nie wprowadza produkcyjnej trasy.
- Zrzuty są dowodem manualnym; nie zastępują automatycznego porównania baseline z `toHaveScreenshot`.

## Success Criteria (Summary)

- Zalogowany panel używa tokenów oraz lokalnych prymitywów, a upload jest jego najczytelniejszą akcją.
- Stany loading, error, empty, disabled i focus są odróżnialne, dostępne i nie naruszają dotychczasowej ochrony danych kancelarii.
- `npm test`, `npm run lint` i `npm run build` przechodzą, a kitchen sink ma udokumentowane zrzuty desktop i mobile.
