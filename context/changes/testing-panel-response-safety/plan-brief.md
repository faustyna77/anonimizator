# Testy bezpieczeństwa panelu i odpowiedzi — Plan Brief

> Full plan: `context/changes/testing-panel-response-safety/plan.md`
> Research: `context/changes/testing-panel-response-safety/research.md`

## What & Why

Faza 3 domyka ochronę panelu przy błędach API/CORS oraz ochronę deanonymizacji przed częściowym ujawnieniem danych. Testy i małe korekty kontraktu sprawią, że zmodyfikowany marker lub uszkodzone mapowanie nie zmienią się w niekontrolowane odtworzenie PII.

## Starting Point

Backend odtwarza marker przez literalne dopasowanie znanych kluczy, a panel posiada już centralne bezpieczne mapowanie błędów. Brakuje granic dla markerów z doczepionym tekstem, pustych wartości mappingu, POST preflight deanonymizacji oraz poprawnego sukcesu JSON po stronie klienta.

## Desired End State

Tylko pełny, autonomiczny marker z niepustego poprawnego mappingu jest odtwarzany. Panel rozróżnia poprawny wynik, także pusty, od odpowiedzi niepoprawnej lub niedostępnej; CORS i błędy transportu nie ujawniają danych ani nie kończą sesji bez przyczyny.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Marker z sąsiednim tekstem | Pozostaje w całości literalny | Zapobiega częściowemu ujawnieniu PII z uszkodzonego tokenu | Plan |
| Pusta wartość mappingu | Niedostępny wynik / ogólne 404 | Puste zastąpienie cicho usuwa marker i zaciera błąd integralności | Plan |
| CORS | TestClient + jeden smoke przeglądarkowy | Deterministyczne testy sprawdzają kontrakt; browser potwierdza rzeczywisty preflight | Research |
| Odpowiedź klienta | Walidowany `response_text` | Poprawny JSON o złym kształcie nie może udawać pustego sukcesu | Research |

## Scope

**In scope:**
- serwisowa walidacja mappingu i granice substytucji markerów,
- testy API CORS/deanonymizacji,
- walidacja wyniku deanonymizacji w kliencie React,
- pełne lokalne gates oraz ręczny smoke na syntetycznych danych.

**Out of scope:**
- migracje, nowy endpoint, nowy model danych lub mechanizm autoryzacji,
- testy na produkcyjnych dokumentach i sekretach,
- nowy framework E2E lub automatyzacja logowania do produkcji.

## Architecture / Approach

Serwis backendu pozostaje właścicielem semantyki markerów i zwraca dotychczasowy bezpieczny stan niedostępności. FastAPI sprawdza CORS na granicy HTTP, a klient React sprawdza sukces JSON przed aktualizacją stanu. Browser smoke sprawdza wyłącznie granicę, której nie pokryją mocki.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Integralność markerów i mappingu | Bezpieczna substytucja i regresje serwisu | Częściowe ujawnienie PII |
| 2. Kontrakty CORS oraz odpowiedzi klienta | Testowany preflight i bezpieczny sukces klienta | Ukryty błąd/stan UI |
| 3. Bramka regresji i browser smoke | Pełne lokalne gates i ręczna weryfikacja | Dryf runtime/deploy origin |

**Prerequisites:** Python 3.11 venv z zależnościami; Docker dla jednorazowej PostgreSQL; testowe konto i syntetyczny dokument wyłącznie do ręcznego smoke.
**Estimated effort:** ~2–3 sesje przez 3 fazy.

## Open Risks & Assumptions

- Skonfigurowany origin i bezpieczna ścieżka uwierzytelnienia do smoke nie są zapisane w śledzonych plikach; ręczny smoke zostaje oczekujący bez testowego konta.
- Historyczny mapping z pustą wartością celowo będzie odrzucony jako niedostępny wynik.

## Success Criteria (Summary)

- Zmodyfikowany marker i pusta wartość mappingu nie odtwarzają ani nie usuwają danych.
- Dozwolony origin przechodzi kontrakt POST deanonymizacji, a niedozwolony origin nie otrzymuje zezwalających nagłówków.
- Backend, frontend i rozszerzenie przechodzą lokalne bramki; smoke używa wyłącznie danych syntetycznych.
