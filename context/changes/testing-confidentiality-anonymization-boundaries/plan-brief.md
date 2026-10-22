# Testy granic poufności i anonimizacji — Plan Brief

> Full plan: `context/changes/testing-confidentiality-anonymization-boundaries/plan.md`
> Research: `context/changes/testing-confidentiality-anonymization-boundaries/research.md`

## What & Why

Plan wzmacnia ochronę danych kancelarii i poprawność anonimizacji dokumentów, zanim rozszerzenie Chrome oraz kolejne integracje zwiększą powierzchnię produktu. Najważniejsze jest wykrycie regresji, w której uwierzytelniony użytkownik przekracza granicę kancelarii albo w której PDF/DOCX przechodzi do AI z niepełnym lub niespójnym mappingiem.

## Starting Point

Backend już buduje zaufany `AccessContext`, stosuje `office_id` w repozytoriach i używa Pytest z oznaczonymi testami PostgreSQL. Obecne testy formatów obejmują pięć klas PII, ale część testów dostępu implementuje filtrowanie własności we własnych fake’ach, a service-level persistence pokrywa DOCX z jednym PESEL.

## Desired End State

Dwie kancelarie mogą być bezpiecznie reprezentowane w testach przez prawdziwą PostgreSQL: B nie odczyta, nie zmodyfikuje ani nie wykorzysta mapowania A. Dla PDF i DOCX manifest syntetycznych danych potwierdza pełny łańcuch od redakcji przez szyfrowane mapowanie do odtworzenia wyłącznie dla właściciela.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Granica własności | PostgreSQL + prawdziwe usługi | Fake predykatu własności nie dowodzi prawdziwego zapytania magazynu. | Research |
| Granica storage | Fake S3 | Daje sygnał kontraktu bez dostępu do zewnętrznego AWS. | Research |
| Dane PII | Niezależny manifest syntetyczny | Oczekiwane wyniki nie mogą kopiować regexów ani validatorów produkcji. | Research / Plan |
| Formaty | PDF i DOCX | Są jedynymi formatami obsługiwanymi przez ścieżkę produkcyjną. | Research |
| Zakres | Testy backendu bez zmian produkcyjnych | Plan ma obronić aktualne kontrakty, a nie zmieniać funkcjonalność. | Plan |

## Scope

**In scope:**
- izolacja dokumentów, mappingu i statusów pomiędzy dwiema kancelariami;
- izolacja aktywnych reguł kancelarii podczas przetwarzania dokumentu;
- pięć klas PII dla PDF/DOCX wraz z mapowaniem, szyfrowaniem i odtworzeniem;
- cookbook i polecenia bramki backendowej.

**Out of scope:**
- zmiany API, modeli, migracji i produkcyjnych usług;
- OCR, dodatkowe formaty, rozszerzenie Chrome oraz E2E przeglądarki;
- prawdziwy S3, Supabase, Fly lub dane produkcyjne;
- nieudokumentowane obszary DOCX/PDF, takie jak komentarze i text boxes.

## Architecture / Approach

Testy własności korzystają z `migrated_session_factory` i dwóch trwałych kancelarii; fake storage pozostaje na granicy S3. Testy formatów używają prawdziwych adapterów PDF/DOCX oraz jednego manifestu wartości testowych niezależnego od silnika anonimizerów. W ten sposób jednostkowe asercje są tanie, a tylko wrażliwe połączenia storage/repository/service korzystają z PostgreSQL.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Granica dokumentu i mapowania | Realne odmowy między kancelariami | Wyciek lub mutacja danych A przez B |
| 2. Snapshot reguł | Izolacja reguł w pipeline dokumentu | Reguła A zmienia artefakt B |
| 3. Pełny PII mapping | PDF/DOCX → mapping → restoration | Pominięte lub niespójne PII |
| 4. Bramka i cookbook | Powtarzalne uruchamianie i wzorzec | Utrata ochrony przy przyszłych zmianach |

**Prerequisites:** Pythonowe zależności testowe oraz jawny `TEST_DATABASE_URL` dla lokalnej bazy kończącej się `_test` przy uruchamianiu testów PostgreSQL.
**Estimated effort:** ~3–4 sesje implementacyjne w czterech fazach.

## Open Risks & Assumptions

- Obecny model zakłada jedną kancelarię na użytkownika; współdzielone członkostwo kancelarii wymagałoby osobnej decyzji produktowej.
- Testy ograniczają się do wspieranej warstwy tekstowej PDF oraz akapitów/tabel/nagłówków/stopek DOCX.
- Uruchomienie integracji PostgreSQL zależy od lokalnego, izolowanego `TEST_DATABASE_URL`; plan nie dodaje ani nie zapisuje jego wartości.

## Success Criteria (Summary)

- Kancelaria B nie otrzymuje danych, URL-a ani odtworzonego PII kancelarii A i nie zmienia stanu A.
- PDF oraz DOCX z pięcioma wspieranymi klasami PII mają potwierdzony artefakt, mapping i odtworzenie właściciela.
- Cookbook dokumentuje realny, powtarzalny wzorzec dla następnego testu granicy backendu.
