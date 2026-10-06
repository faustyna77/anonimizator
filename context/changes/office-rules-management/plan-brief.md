# Reguły anonimizacji kancelarii — Plan Brief

> Full plan: `context/changes/office-rules-management/plan.md`

## What & Why

Kancelaria otrzyma panel do definiowania dodatkowych fraz i regexów bez zmian w rozszerzeniu Chrome. Zamiast ręcznie poprawiać każdy dokument, prawnik zapisze regułę raz i backend zastosuje ją do kolejnych uploadów.

## Starting Point

Dziś anonimizer ma tylko pięć reguł wpisanych na stałe, a reguły kancelarii nie istnieją w bazie, API ani panelu. Upload z panelu i rozszerzenia już ma wspólny, uwierzytelniony endpoint backendowy i serwerowy kontekst kancelarii.

## Desired End State

Użytkownik kancelarii tworzy frazy i regexy, nadaje im etykiety markerów oraz włącza lub wyłącza je w panelu. Regex MVP opisuje samą wartość do ukrycia, bez kotwic i granic słów, dzięki czemu działa jednakowo w PDF oraz DOCX. Aktywna reguła działa na następnym PDF/DOCX przesłanym z panelu lub rozszerzenia; druga kancelaria nie może jej zobaczyć ani zmienić.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Model danych | Jedna tabela z `kind: phrase|regex` | Jeden prosty CRUD i wspólne pola bez rozbudowy słowników. |
| Frazy | Dosłowne, case-insensitive | Nazwiska i nazwy są wygodniejsze bez zależności od wielkości liter. |
| Regex | RE2 przez `google-re2`, bez regexów kontekstowych | Eliminuje ReDoS i zachowuje zgodność redakcji PDF z dopasowaniem. |
| Marker | Własna, współdzielona etykieta `KLIENT` → `[KLIENT_1]`, `[KLIENT_2]` | Kategorie pozostają czytelne dla wielu wpisów słownika i gotowe na S-04. |
| Kolizje | Najdłuższe, potem wbudowane, frazy, regexy, ID | Wynik jest bezpieczny i deterministyczny. |
| Zakres rozszerzenia | Bez zmian | Backend stosuje reguły per token na aktualnym endpointcie uploadu. |

## Scope

**In scope:** migracja PostgreSQL, reguły per kancelaria, bezpieczny silnik regex, API CRUD, zastosowanie w PDF/DOCX, panel React i testy izolacji.

**Out of scope:** reguły w popupie Chrome, import/bulk edit, grupy słowników, historia zmian, automatyczne wykrywanie nazw własnych.

## Architecture / Approach

`office_anonymization_rules` przechowuje aktywne i wyłączone reguły kancelarii. Serwis pobiera aktywne wpisy z `AccessContext.office_id`, tworzy jeden snapshot dla dokumentu i przekazuje go do PDF/DOCX. Panel zarządza wpisami przez istniejący klient API; rozszerzenie nadal wysyła wyłącznie plik i Bearer token.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Model i silnik | Dane kancelarii oraz bezpieczne dopasowania | ReDoS, kolizje, wycieki między kancelariami |
| 2. API i dokumenty | Chroniony CRUD i snapshot dla PDF/DOCX | Pominięcie kontekstu kancelarii na ścieżce uploadu |
| 3. Panel | Formularze oraz kontrola reguł | Czytelne błędy i brak `office_id` w kliencie |

**Prerequisites:** Python 3.11 oraz testowa PostgreSQL o nazwie kończącej się na `_test`.
**Estimated effort:** 2–3 sesje implementacyjne.

## Open Risks & Assumptions

- RE2 nie obsługuje części zaawansowanej składni Python `re`; MVP odrzuca również kotwice i granice słów, aby regex w PDF wskazywał dokładnie wartość do redakcji.
- Pełna bramka backendu wymaga środowiska Python 3.11 oraz testowej PostgreSQL `_test`; bieżąca `.venv` ma Python 3.9.
- Jedno konto ma dziś jeden profil i jedną kancelarię; współdzielenie reguł między kontami jest poza S-03.

## Success Criteria (Summary)

- Kancelaria bezpiecznie zarządza aktywnymi frazami i regexami.
- Kolejny upload PDF/DOCX stosuje aktualny snapshot reguł, także z rozszerzenia.
- Reguły jednej kancelarii pozostają niewidoczne i niemodyfikowalne dla innej.
