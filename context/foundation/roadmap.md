---
project: Anonymizer Prawniczy
version: 1
status: draft
created: 2026-09-28
updated: 2026-10-03
prd_version: —
main_goal: speed
top_blocker: time
milestone_id: first-usable-anonymization-flow
milestone_seq: 1
milestone_status: open
---

# Roadmap: Anonymizer Prawniczy

> Derived from `context/foundation/prd.md`, `context/foundation/tech-stack.md`, and the auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Pierwszy użyteczny przepływ anonimizacji** — Status: open

- **Intent:** Prawnik może bezpiecznie przekazać dokument do anonimizacji i otrzymać wersję ze znacznikami danych poufnych. Ten wynik potwierdza podstawową wartość produktu przed rozwijaniem integracji i konfiguracji.
- **Source materials:** `context/foundation/prd.md` (sekcje 4–6) + `context/foundation/tech-stack.md`.
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:**
  - **MS-01:** PRD §4.2 — wykrywanie PESEL, NIP, e-maila, telefonu i IBAN oraz zamiana na znaczniki.
  - **MS-02:** PRD §4.1 — użycie na webowych aplikacjach AI przez rozszerzenie Chrome.
  - **MS-03:** PRD §4.2–4.3 — późniejszy dostęp do zanonimizowanych danych.
  - **MS-04:** PRD §4.3 — reguły kancelarii, słowniki i odwracanie znaczników.
  - **MS-05:** PRD §6 — logowanie oraz pilotaż dla 1–10 kancelarii.
  - **MS-06:** PRD §5 — poza MVP pozostają inne przeglądarki, aplikacje natywne, inne języki i automatyczne wykrywanie imion oraz nazwisk.

## Vision recap

Prawnicy ręcznie anonimizują dokumenty przed wysłaniem ich do narzędzi AI, co kosztuje czas i grozi pominięciem danych poufnych. Produkt ma przekazać im kontrolę przez automatyczne oznaczanie danych w dokumentach oraz możliwość późniejszego korzystania z zanonimizowanej wersji.

## North star

**S-01: Prawnik wysyła PDF/DOCX i otrzymuje wersję ze znacznikami danych poufnych.** To najkrótszy pełny przepływ, który sprawdza podstawową wartość opisaną w MS-01.

> Gwiazda przewodnia oznacza tutaj najmniejszy przepływ od działania użytkownika do użytecznego wyniku, który dowodzi, że produkt rozwiązuje główny problem.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
| --- | --- | --- | --- | --- | --- |
| F-01 | minimal-document-access | (foundation) granica dostępu oddziela dokumenty i reguły kancelarii | — | MS-03, MS-05 | done |
| S-01 | document-anonymization-flow | wysłać PDF/DOCX i odebrać wersję ze znacznikami | F-01 | MS-01, MS-03 | proposed |
| S-02 | chrome-ai-anonymization | uruchomić anonimizację z rozszerzenia na aplikacji AI | S-01 | MS-02 | proposed |
| S-03 | office-rules-management | zarządzać regułami i słownikami kancelarii | F-01, S-01 | MS-04, MS-05 | proposed |
| S-04 | response-deanonymization | odwrócić znaczniki w odpowiedzi modelu | S-01, S-02 | MS-04 | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
| --- | --- | --- | --- |
| A | Główny przepływ dokumentu | `F-01` → `S-01` → `S-02` → `S-04` | Najkrótsza ścieżka do działającego MVP. |
| B | Reguły kancelarii | `S-03` | Dołącza do strumienia A po `S-01`; nie opóźnia integracji z AI. |

## Baseline

What's already in place in the codebase as of `2026-09-28` (auto-researched + user-confirmed). Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — istnieje pojedynczy ekran uploadu, bez pełnej nawigacji produktu.
- **Backend / API:** partial — istnieje kontrola zdrowia i szkielet anonimizacji, ale wynik anonimizacji jest statyczny.
- **Data:** absent — brak trwałego przechowywania, migracji i danych początkowych.
- **Auth:** absent — brak tożsamości, sesji i ochrony przepływu anonimizacji.
- **Deploy / infra:** present — istnieją artefakty wdrożeniowe i automatyczne wdrażanie; dokumentacja celu wdrożenia jest rozbieżna ze stanem repozytorium.
- **Observability:** partial — istnieje podstawowa obsługa błędów po stronie klienta, bez metryk i monitorowania usługi.

## Foundations

### F-01: Minimalna granica dostępu do dokumentów

- **Outcome:** (foundation) granica dostępu oddziela dokumenty i reguły jednej kancelarii od danych innych kancelarii.
- **Change ID:** minimal-document-access
- **PRD refs:** MS-03, MS-05
- **Unlocks:** S-01, S-03
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** Czy jedno konto użytkownika może należeć do więcej niż jednej kancelarii? — Owner: user. Block: no.
- **Risk:** Minimalny zakres musi od razu oddzielać dane kancelarii, bez rozbudowywania modelu uprawnień poza potrzeby pilotażu.
- **Status:** done

## Slices

### S-01: Przepływ anonimizacji dokumentu

- **Outcome:** Prawnik może wysłać PDF/DOCX i odebrać wersję ze znacznikami PESEL, NIP, e-maila, telefonu i IBAN.
- **Change ID:** document-anonymization-flow
- **PRD refs:** MS-01, MS-03
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Jaka forma odebrania zanonimizowanego dokumentu jest wymagana w pilotażu? — Owner: user. Block: no.
- **Risk:** Ten wycinek weryfikuje poprawność podstawowej wartości produktu; błędne lub niespójne znaczniki podważają użyteczność późniejszych funkcji.
- **Status:** proposed

### S-02: Anonimizacja z rozszerzenia Chrome

- **Outcome:** Prawnik może uruchomić anonimizację z rozszerzenia Chrome podczas pracy w aplikacji AI.
- **Change ID:** chrome-ai-anonymization
- **PRD refs:** MS-02
- **Prerequisites:** S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Które aplikacje AI poza środowiskiem lokalnym muszą wejść do pierwszego pilotażu? — Owner: user. Block: no.
- **Risk:** Zakres integracji ma pozostać ograniczony do webowych aplikacji AI, aby nie rozszerzać MVP o inne platformy.
- **Status:** proposed

### S-03: Zarządzanie regułami kancelarii

- **Outcome:** Prawnik może przeglądać, tworzyć, zmieniać i usuwać reguły oraz słowniki swojej kancelarii.
- **Change ID:** office-rules-management
- **PRD refs:** MS-04, MS-05
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - Które reguły i słowniki poza pięcioma wskazanymi typami danych mają być dostępne w pilotażu? — Owner: user. Block: no.
- **Risk:** Reguły muszą należeć do właściwej kancelarii, ale konfiguracja nie może opóźnić podstawowego przepływu anonimizacji.
- **Status:** proposed

### S-04: Odwracanie znaczników odpowiedzi modelu

- **Outcome:** Prawnik może odwrócić znaczniki w odpowiedzi modelu, korzystając z mapowania utworzonego dla dokumentu.
- **Change ID:** response-deanonymization
- **PRD refs:** MS-04
- **Prerequisites:** S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Jak produkt ma obsłużyć nieznany, zmieniony lub brakujący znacznik w odpowiedzi modelu? — Owner: user. Block: no.
- **Risk:** Odwracanie zależy od spójnego mapowania z S-01 oraz od przepływu odpowiedzi z aplikacji AI.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
| --- | --- | --- | --- | --- |
| F-01 | minimal-document-access | Oddziel dostęp do dokumentów i reguł kancelarii | yes | Odblokowuje S-01 i S-03. |
| S-01 | document-anonymization-flow | Umożliw anonimizację PDF/DOCX ze znacznikami | no | Czeka na F-01. |
| S-02 | chrome-ai-anonymization | Umożliw anonimizację z rozszerzenia Chrome | no | Czeka na S-01. |
| S-03 | office-rules-management | Umożliw zarządzanie regułami kancelarii | no | Czeka na F-01 i S-01. |
| S-04 | response-deanonymization | Umożliw odwracanie znaczników w odpowiedzi modelu | no | Czeka na S-01 i S-02. |

## Open Roadmap Questions

1. **Jaki cel wdrożenia jest kanoniczny dla projektu?** — Owner: user. Block: roadmap-wide documentation only; zmiana obecnego wdrożenia pozostaje zaparkowana, dopóki nie ma osobnej decyzji.

## Parked

- **Migracja celu wdrożenia** — Why parked: źródła są rozbieżne, a migracja nie jest potrzebna do sprawdzenia głównego przepływu anonimizacji.
- **Inne przeglądarki niż Chrome** — Why parked: MS-06 wyłącza je z MVP.
- **Aplikacje natywne i desktopowe AI** — Why parked: MS-06 ogranicza produkt do aplikacji webowych.
- **Inne języki niż polski** — Why parked: MS-06 ogranicza pierwszą wersję do języka polskiego.
- **Automatyczne wykrywanie imion i nazwisk** — Why parked: MS-06 wyłącza ten trudniejszy etap z pierwszej wersji.

## Milestone History

—

## Done

- **F-01: (foundation) granica dostępu oddziela dokumenty i reguły jednej kancelarii od danych innych kancelarii.** — Archived 2026-10-03 → `context/archive/2026-10-02-minimal-document-access/`. Lesson: —.
