# Anonimizacja NRB i poprawna klasyfikacja REGON — Implementation Plan

## Overview

Naprawić ryzyko faktury w backendowym `DocumentAnonymizer`: walidowany polski NRB bez `PL` ma otrzymać marker `[NRB_1]`, a prawidłowy 9-cyfrowy REGON marker `[REGON_1]`, nigdy `[TELEFON_1]`. Praca rozpoczyna się od niezależnych czerwonych testów na danych syntetycznych, a następnie rozszerza istniejący manifest i realne adaptery PDF/DOCX.

## Current State Analysis

- `_iban_is_valid` akceptuje wyłącznie `PL` + 26 cyfr, a `_RULES` nie zawiera NRB (`backend/app/anonymization.py:122-150`).
- Wzorzec telefonu akceptuje dziewięć cyfr (`backend/app/anonymization.py:139-142, 170-174`), więc zbiega się z formatem 9-cyfrowego REGON.
- Selekcja konfliktujących dopasowań jest deterministyczna przez `(start, długość malejąco, priority, rule_id)` (`backend/app/anonymization.py:220-231`).
- `backend/tests/pii_manifest.py` jest niezależną wyrocznią dla testów tekstu, PDF i DOCX; wszystkie typy automatyczne muszą być zaktualizowane razem.
- Lokalny `.venv` wymaga odtworzenia na Pythonie 3.11+, zanim testy zostaną uznane za wiarygodne; obecny interpreter 3.9 nie instaluje wymaganej wersji PyMuPDF.

## Desired End State

1. Faktura z prawidłowym, syntetycznym NRB bez prefiksu `PL` nie zawiera numeru w artefakcie ani mappingu jawnym; używa `[NRB_1]` i zachowuje oryginalną pierwszą pisownię wyłącznie jako wartość mappingu.
2. Prawidłowy 9-cyfrowy REGON jest `[REGON_1]`, nawet jeśli pasuje do telefonu.
3. Telefon z syntetycznym polskim numerem nadal jest `[TELEFON_1]`.
4. Błędny NRB nie jest maskowany. Błędny REGON nie otrzymuje markera `REGON`; może otrzymać istniejący marker telefonu, ponieważ dziewięć cyfr nie pozwala odróżnić tych typów bez dodatkowego kontekstu.
5. Te zachowania są pokryte przez testy tekstowe oraz istniejące adaptery PDF/DOCX bez Chrome, UI, API lub E2E.

## What We're NOT Doing

- Nie dodajemy obsługi 14-cyfrowego REGON, OCR, skanów, sprawdzeń GUS/bankowych, Chrome, frontendowych formularzy, endpointów ani migracji.
- Nie używamy prawdziwych danych, rachunków lub dokumentów klientów.
- Nie zmieniamy zachowania istniejących PESEL, NIP, e-maila, telefonu ani IBAN poza rozstrzygnięciem konfliktu REGON–telefon.

## Phase 1: Setup testów i niezależny kontrakt regresji

### Overview

Przygotować zgodne środowisko Python 3.11+ oraz rozszerzyć niezależną wyrocznię testową o syntetyczny NRB i REGON. Najpierw uruchomić focused tests i potwierdzić czerwony stan z właściwej przyczyny.

### Changes Required

#### 1. Zgodny interpreter testowy

**Files**: brak zmian produkcyjnych; lokalny `.venv` odtworzony przez `python3.11 -m venv .venv` i `pip install -r backend/requirements-dev.txt`.

**Contract**: Testy importują `google-re2`, PyMuPDF oraz lokalny kod pod Pythonem zgodnym z `pyproject.toml`; nie stosujemy zastępczego `re` ani nie obniżamy deklarowanego minimum Pythona.

#### 2. Czerwone testy scenariusza faktury

**Files**: `backend/tests/test_anonymization.py`, `backend/tests/pii_manifest.py`.

**Contract**: Przed implementacją poprawny NRB jest literalny, a REGON jest `[TELEFON_1]`; testy te muszą zostać zaobserwowane jako czerwone z tymi objawami. Manifest deklaruje oczekiwane wartości bez importowania regexów lub walidatorów produkcyjnych.

### Success Criteria

- Focused Pytest uruchamia się na Pythonie 3.11+.
- Czerwony wynik wynika z brakującej detekcji NRB i błędnej klasyfikacji REGON, nie z błędu importu/fixture.

## Phase 2: Minimalna walidacja i priorytet silnika

### Overview

Dodać najmniejszą implementację pozwalającą spełnić czerwony kontrakt: walidację NRB przez istniejący MOD-97 IBAN oraz 9-cyfrowego REGON przez modulo 11. Umieścić REGON przed telefonem przez jawny `priority`.

### Changes Required

#### 1. Nowe reguły z walidacją i kanonizacją

**Files**: `backend/app/anonymization.py`.

**Contract**:
- NRB dopasowuje dokładnie 26 cyfr w polskim układzie `2 + 6×4`, opcjonalnie rozdzielonych pojedynczą spacją lub myślnikiem; walidator sprawdza `PL` + znormalizowany NRB istniejącym MOD-97, a kanonizacja usuwa rozdzielacze.
- REGON dopasowuje dokładnie dziewięć cyfr, stosuje wagi `(8, 9, 2, 3, 4, 5, 6, 7)`, mapuje resztę `10` na `0` i kanonizuje do cyfr.
- REGON ma niższy `priority` niż telefon, więc przy identycznym zakresie jego marker jest `REGON`.
- `NRB` i `REGON` są zarezerwowanymi etykietami systemowymi, tak jak pozostałe automatyczne typy.

#### 2. Zielone focused tests oraz near-misses

**Files**: `backend/tests/test_anonymization.py`, `backend/tests/pii_manifest.py`.

**Contract**: Poprawne warianty NRB i REGON używają tego samego markera po kanonizacji; błędny NRB nie zmienia tekstu; błędny REGON nie tworzy markera `REGON` i zachowuje istniejącą obsługę telefonu dla dziewięciu cyfr; zwykły telefon pozostaje telefonem.

### Success Criteria

- Czerwone testy z Fazy 1 stają się zielone po minimalnej implementacji.
- Istniejące testy silnika nie mają regresji.

## Phase 3: Pełny dokument, opis produktu i bramka regresji

### Overview

Przeprowadzić oba identyfikatory przez istniejące, rzeczywiste adaptery DOCX/PDF oraz zaktualizować jedną deklarację zakresu produktu.

### Changes Required

#### 1. Siedmiotypowy manifest i adaptery formatów

**Files**: `backend/tests/pii_manifest.py`, `backend/tests/test_anonymization.py`, `backend/tests/test_document_formats.py`.

**Contract**: Manifest obejmuje PESEL, NIP, e-mail, REGON, telefon, NRB i IBAN, z markerami, wariantami kanonicznymi i near-missami. PDF/DOCX zawierają wszystkie markery, nie zawierają wartości źródłowych i zwracają dokładnie oczekiwany mapping.

#### 2. Dokumentacja obsługiwanych typów

**Files**: `README.md`.

**Contract**: Zakres S-01 wymienia NRB i REGON obok już obsługiwanych identyfikatorów; nie obiecuje OCR ani walidacji istnienia podmiotu/rachunku.

#### 3. Pełna weryfikacja

**Files**: brak dodatkowych zmian.

**Contract**: focused testy, pełny backendowy Pytest i `git diff --check` przechodzą na Pythonie zgodnym z projektem. Weryfikacja nie korzysta z rzeczywistych usług lub danych klientów.

### Success Criteria

- Oba adaptery formatów pokrywają nowe markery i mapping.
- Wszystkie testy backendu przechodzą.
- Dokumentacja odpowiada realnemu zachowaniu.

## Testing Strategy

1. Najpierw focused testy silnika z poprawnym i błędnym NRB/REGON oraz telefonem.
2. Następnie `backend/tests/test_anonymization.py` i `backend/tests/test_document_formats.py`.
3. Na końcu pełne `.venv/bin/python -m pytest`; testy PostgreSQL wymagają istniejącej jawnej konfiguracji `_test` i mogą zostać osobno pominięte zgodnie z fixture.

## Manual Verification

Po zielonych testach uruchomić lokalny produkcyjny `DocumentAnonymizer` wyłącznie z syntetyczną linią faktury: `11 1140 2004 0000 3002 1800 0002`, `192598474` i `+48 123 456 789`; oczekiwać trzech różnych markerów `[NRB_1]`, `[REGON_1]`, `[TELEFON_1]`. Nie przesyłać danych klientów.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` only after a commit lands. Do not rename step titles.

### Phase 1: Setup testów i niezależny kontrakt regresji

#### Automated

- [x] 1.1 Restore a Python 3.11+ backend test environment with declared dependencies
- [x] 1.2 Add and observe focused red tests for unmasked NRB and REGON-versus-phone classification

### Phase 2: Minimalna walidacja i priorytet silnika

#### Automated

- [x] 2.1 Add validated NRB and nine-digit REGON rules with reserved marker labels
- [x] 2.2 Verify valid variants, invalid checksums, and unchanged telephone classification

### Phase 3: Pełny dokument, opis produktu i bramka regresji

#### Automated

- [x] 3.1 Extend the independent PII manifest and real PDF/DOCX coverage to seven automatic identifier types
- [x] 3.2 Update the S-01 supported-identifier documentation
- [x] 3.3 Run focused and full backend regression gates plus whitespace validation

#### Manual

- [x] 3.4 Verify a synthetic invoice line produces distinct NRB, REGON, and telephone markers
