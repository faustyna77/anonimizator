<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Zarządzanie regułami anonimizacji kancelarii

- **Plan**: `context/changes/office-rules-management/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-06
- **Verdict**: SOUND after triage
- **Findings**: 1 critical, 5 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding

Grounding: 7/7 paths ✓, 4/4 symbols ✓, brief↔plan ✓; no contract-surfaces file exists.

## Findings

### F1 — Regexy kontekstowe nie są bezpieczne dla obecnego adaptera PDF

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architektura PDF wymaga świadomego ograniczenia zakresu.
- **Dimension**: Blind Spots
- **Location**: Phase 1–2, reguły regex i PDF
- **Detail**: `page.search_for(identifier)` znajduje wszystkie wystąpienia tekstu, a nie konkretne przesunięcie dopasowania regexu. Regex zakotwiczony lub kontekstowy mógłby oznaczyć jedno wystąpienie, lecz adapter zredagowałby wszystkie identyczne teksty na stronie.
- **Fix ⭐ Recommended**: Dopuszczać w MVP wyłącznie regex opisujący wartość do ukrycia; odrzucać `^`, `$`, `\b`, `\B` oraz flagi/konstrukcje zależne od kontekstu. Dodać PDF z identycznymi wartościami i test zgodności.
- **Decision**: FIXED — zalecana poprawka zastosowana na podstawie wcześniejszej delegacji użytkownika dla decyzji technicznych.

### F2 — Domyślne błędy Pydantic mogą ujawnić wzorzec regexu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — wymaga kontrolowanego kontraktu błędów.
- **Dimension**: Blind Spots
- **Location**: Phase 2 — API
- **Detail**: Walidator Pydantic może zwrócić przesłane pole `input`, w tym poufny wzorzec regexu.
- **Fix**: Parsować payload reguły w route/service i zwracać kontrolowane 422 bez pola wejściowego ani treści wzorca; pokryć błędny, za długi, pusty i nieobsługiwany regex.
- **Decision**: FIXED.

### F3 — API CRUD potrzebuje wstrzykiwalnego serwisu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — spójność z istniejącym testowaniem.
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — API
- **Detail**: `create_app` wstrzykuje tylko serwisy dokumentów, podczas gdy testy API używają kontrolowanych fake’ów.
- **Fix**: Dodać protokół i opcjonalny `office_rule_service` do `create_app`, aby testy API używały office-keyed fake bez prawdziwej bazy.
- **Decision**: FIXED.

### F4 — Brakuje środowiska DOM do testów UI React

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — dodanie kolejnej warstwy testowej rozszerza MVP.
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — panel
- **Detail**: Projekt ma Vitest dla testów klienta API, ale nie ma jsdom, Testing Library ani konfiguracji testów renderowanych komponentów.
- **Fix**: Pokryć automatycznie kontrakt `api.js`; pełne zachowanie formularzy, komunikatów i sesji zostawić jako jawny test manualny S-03.
- **Decision**: FIXED.

### F5 — Limit 50 aktywnych reguł wymaga synchronizacji

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — limit nie może być tylko count-then-write.
- **Dimension**: Blind Spots
- **Location**: Phase 1 — repozytorium
- **Detail**: Równoległe create/enable mogłyby niezależnie zobaczyć 49 aktywnych reguł i zapisać 51.
- **Fix**: W create oraz przejściu `enabled=false → true` zablokować w transakcji wiersz kancelarii, policzyć aktywne reguły i dopiero zapisać; dodać test konkurencyjnego ograniczenia.
- **Decision**: FIXED.

### F6 — Pełna bramka backendu wymaga Python 3.11 i PostgreSQL testowej

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — warunek środowiskowy.
- **Dimension**: Plan Completeness
- **Location**: Phase 1–2 — verification
- **Detail**: `.venv/bin/python` ma Python 3.9.6, a migracyjne testy PostgreSQL wymagają `TEST_DATABASE_URL` z nazwą kończącą się `_test`.
- **Fix**: Przed bramką utworzyć/reużyć Python 3.11, zainstalować zależności backend/dev i podać testową PostgreSQL; nie deklarować pełnej zielonej bramki bez tych warunków.
- **Decision**: FIXED.
