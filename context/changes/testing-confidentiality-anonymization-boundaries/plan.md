# Testy granic poufności i anonimizacji — Implementation Plan

## Overview

Dodać testy regresji dla dwóch najwyższych ryzyk: przekroczenia granicy kancelarii oraz niepełnej anonimizacji PDF/DOCX. Plan wzmacnia istniejącą bazę Pytest bez zmiany produkcyjnego API, modeli ani migracji.

## Current State Analysis

Backend przekazuje serwerowo wyprowadzony `AccessContext` do repozytoriów dokumentów i reguł, a oba obszary filtrują dane po `office_id` (`backend/app/auth.py:61-80`, `backend/app/document_repository.py:41-96`, `backend/app/office_rule_repository.py:71-151`). Jednak część obecnych testów dla historii, pobrania i deanonymizacji odtwarza predykat własności w fake’ach, zamiast przejść przez prawdziwy magazyn (`backend/tests/test_document_access.py:72-228`, `backend/tests/test_api_access.py:532-591`).

Silnik anonimizerów oraz adaptery PDF/DOCX obejmują pięć klas PII, ale ścieżka zaszyfrowanego mapowania jest dziś testowana serwisowo dla DOCX z jednym PESEL (`backend/app/anonymization.py:144-253`, `backend/tests/test_document_formats.py:66-161`, `backend/tests/test_document_service.py:158-203`). PostgreSQL fixture już uruchamia migracje wyłącznie dla jawnego URL-a kończącego się `_test` (`backend/tests/conftest.py:20-53`).

## Desired End State

Po wdrożeniu testy udowadniają na rzeczywistym PostgreSQL, że kontekst kancelarii B nie może odczytać, zmodyfikować, pobrać ani użyć mapowania dokumentu kancelarii A. Osobny zestaw serwisowy udowadnia dla PDF i DOCX, że pięć wspieranych klas PII przechodzi przez transformację, zaszyfrowane mapowanie i późniejsze odtworzenie wyłącznie dla właściciela.

### Key Discoveries:

- `ResponseDeanonymizationService` pobiera dokument z predykatem `document_id` + zaufany `office_id` zanim odszyfruje mapowanie (`backend/app/document_service.py:161-202`).
- `mark_document_ready` i `mark_document_failed` używają tego samego scoped lookup, lecz obcy kontekst nie jest dziś badany dla tych dwóch mutacji (`backend/app/document_repository.py:66-96`, `backend/tests/test_document_repository.py:31-74`).
- Aktywne reguły kancelarii są ładowane do anonimizerów przez office-scoped snapshot (`backend/app/office_rule_repository.py:99-113`, `backend/app/office_rule_service.py:151-175`).
- PDF i DOCX mają odmienne granice transformacji, dlatego oba formaty wymagają wspólnej, niezależnej wyroczni danych testowych (`backend/app/document_formats.py:23-170`).

## What We're NOT Doing

- Nie zmieniamy modeli danych, migracji, publicznych endpointów ani zasad autoryzacji.
- Nie dodajemy OCR, obsługi dodatkowych formatów, rozszerzenia Chrome ani testów E2E przeglądarki.
- Nie używamy prawdziwych AWS, Supabase, Fly ani dokumentów produkcyjnych.
- Nie rozszerzamy zakresu o tekst boxes, komentarze, przypisy DOCX ani nietypowe rozbieżności ekstrakcji PDF.

## Implementation Approach

Stosować najtańszą warstwę dającą realny sygnał. Własność i snapshot reguł testować na migracyjnej PostgreSQL z syntetycznymi dwiema kancelariami; obiekty przechowywać przez istniejący fake S3. Transformację formatów i pełne mapowanie testować na prawdziwych adapterach PDF/DOCX z manifestem oczekiwań niezależnym od regexów produkcyjnych. W istniejących testach zachować fake’i tam, gdzie badają wyłącznie translację HTTP, ale nie używać ich jako dowodu predykatu własności.

## Critical Implementation Details

Dane testowe muszą powstawać z kontrolowanego manifestu, który nie importuje `_RULES` ani nie oblicza oczekiwanych markerów na podstawie kodu produkcyjnego. Testy PostgreSQL wymagają osobno skonfigurowanego `TEST_DATABASE_URL` z nazwą kończącą się `_test`; brak tej wartości jest oczekiwanym skipem istniejącej fixture, a nie powodem podłączenia dowolnej bazy.

## Phase 1: Trwała granica dokumentu i mapowania

### Overview

Udowodnić na rzeczywistych rekordach dwóch kancelarii, że scoped repository i usługi dokumentów nie pozwalają obcemu kontekstowi na odczyt, mutację ani pośredni dostęp do mapowania.

### Changes Required:

#### 1. Integracyjne przypadki dokumentu i stanu

**Files**: `backend/tests/test_document_repository.py`, nowy moduł integracyjny w `backend/tests/` dla dostępu do dokumentu

**Intent**: Rozszerzyć istniejący wzorzec `migrated_session_factory` o dwa profile/kancelarie i gotowy dokument z zaszyfrowanym mapowaniem. Sprawdzić zachowanie realnego predykatu magazynu zamiast zasymulowanego filtru.

**Contract**: Kontekst B nie może odczytać dokumentu A, zmienić jego statusu na `ready` lub `failed`, ani zmienić przechowywanego mapowania; po próbach rekord A zachowuje pierwotny status i pola.

#### 2. Dostęp i deanonymizacja przez prawdziwe usługi

**Files**: nowy moduł integracyjny w `backend/tests/`, `backend/tests/test_document_access.py`

**Intent**: Połączyć rzeczywisty repository, `DocumentAccessService` i `ResponseDeanonymizationService` z fake storage/cipher, by weryfikować granicę pośredniego dostępu do mappingu oraz brak generowania URL-a dla obcego dokumentu.

**Contract**: Dla dokumentu A kontekst B otrzymuje brak wyniku usługi, nie generuje presigned URL i nie otrzymuje odtworzonej wartości PII; właściciel zachowuje istniejącą ścieżkę sukcesu. Cienki test API może dalej override’ować wyłącznie zależność kontekstu, lecz nie usługę badającą predykat własności.

### Success Criteria:

#### Automated Verification:

- Testy PostgreSQL obejmują obcy odczyt, listę, pobranie, deanonymizację oraz mutacje `ready` i `failed`, a następnie odczytują niezmieniony rekord właściciela.
- Test usługowy potwierdza brak URL-a i brak odtworzonego PII dla kancelarii B oraz sukces kancelarii A z tym samym zaszyfrowanym mapowaniem.
- Wybrany zestaw testów z markerem `postgresql` przechodzi po ustawieniu `TEST_DATABASE_URL` wskazującego bazę `_test`.

#### Manual Verification:

- Osoba uruchamiająca potwierdza, że URL testowej bazy spełnia ograniczenie `_test` i nie wskazuje środowiska współdzielonego ani produkcyjnego.

---

## Phase 2: Granica snapshotu reguł kancelarii

### Overview

Udowodnić, że trwała aktywna reguła kancelarii A nie staje się częścią anonimizerów, artefaktów ani mapowań kancelarii B.

### Changes Required:

#### 1. Dwukancelaryjny snapshot i przetwarzanie dokumentu

**Files**: `backend/tests/test_office_rule_repository.py`, `backend/tests/test_document_service.py` lub nowy moduł integracyjny w `backend/tests/`

**Intent**: Zbudować aktywne reguły dla obu kancelarii przez prawdziwy repository/service, następnie przetworzyć syntetyczny dokument B przez produkcyjny snapshot i istniejący fake storage.

**Contract**: Snapshot B zawiera wyłącznie włączone reguły B; fraza lub regex A nie tworzy markera ani wpisu w zaszyfrowanym mappingu dokumentu B. Dotychczasowe testy limitu i CRUD pozostają bez zmiany semantyki.

### Success Criteria:

#### Automated Verification:

- Test PostgreSQL zapisuje różne aktywne reguły dla A i B i potwierdza, że snapshot B nie zawiera reguły A.
- Test przetwarzania B potwierdza brak markera i odszyfrowanego wpisu A, przy zachowaniu oczekiwanej reguły B.
- Testy istniejącego repository reguł i nowy przypadek snapshotu przechodzą z `_test` PostgreSQL oraz fake storage.

#### Manual Verification:

- Przegląd scenariusza testowego potwierdza, że obie kancelarie mają faktycznie różne trwałe reguły, a nie dwa fake’i z ręcznie zakodowaną filtracją.

---

## Phase 3: Pełny przepływ PII przez format i mapowanie

### Overview

Rozszerzyć dane syntetyczne i testy serwisowe tak, by oba wspierane formaty obejmowały wszystkie pięć klas PII, warianty kanoniczne oraz bezpieczne zachowanie wartości bliskich granicy.

### Changes Required:

#### 1. Niezależny manifest i fabryki syntetycznych dokumentów

**Files**: nowy moduł wsparcia testów w `backend/tests/`, `backend/tests/test_anonymization.py`, `backend/tests/test_document_formats.py`

**Intent**: Wydzielić statyczne syntetyczne wartości źródłowe, dozwolone near-misses, warianty prezentacji i oczekiwane mapowania do manifestu niezależnego od implementacji. Ponownie użyć go przy generowaniu prawdziwych PDF/DOCX w testach.

**Contract**: Wyrocznia testowa opisuje oczekiwane markery, oryginalną pierwszą pisownię oraz wartości, które mają pozostać niezmienione; nie importuje ani nie odtwarza regexów/validatorów produkcyjnych.

#### 2. Parametryzowana ścieżka format → szyfrowane mapowanie → odtworzenie

**Files**: `backend/tests/test_document_formats.py`, `backend/tests/test_document_service.py`, `backend/tests/test_document_access.py`

**Intent**: Dla PDF i DOCX połączyć rzeczywisty adapter, fake storage, szyfrowanie mapowania i `ResponseDeanonymizationService`, rozszerzając dzisiejszy scenariusz DOCX/PESEL o pełny zestaw PII.

**Contract**: Dla obu formatów wynik zawiera oczekiwane markery i nie zawiera wskazanych wartości źródłowych; odszyfrowane mapowanie odpowiada manifestowi; właściciel może odtworzyć wyłącznie znane markery, a marker nieznany pozostaje niezmieniony. Powtórzona wartość w wariancie kanonicznym używa tego samego markera, a kontrolowane near-misses nie tworzą wpisu mappingu.

### Success Criteria:

#### Automated Verification:

- Manifest danych testowych obejmuje PESEL, NIP, e-mail, telefon i IBAN, co najmniej jeden wariant kanoniczny/powtórzenie oraz zdefiniowane near-misses.
- Parametryzowane testy PDF i DOCX potwierdzają markery, brak źródłowego PII w sprawdzanym artefakcie, zaszyfrowane mapowanie i odtworzenie dla właściciela.
- Testy jednostkowe potwierdzają reuse markerów oraz brak mapowania dla kontrolowanych wartości nieprawidłowych bez wyprowadzania oczekiwań z kodu produkcyjnego.

#### Manual Verification:

- Przegląd manifestu potwierdza, że oczekiwane wartości i markery są deklarowane po stronie testu, nie obliczane na podstawie `_RULES` ani validatorów aplikacji.

---

## Phase 4: Bramka regresji i cookbook

### Overview

Zamknąć zmianę powtarzalnym zestawem poleceń oraz zaktualizować cookbook planu testów o wzorce faktycznie wdrożone przez fazy 1–3.

### Changes Required:

#### 1. Powtarzalna weryfikacja backendu

**Files**: `pytest.ini` wyłącznie jeśli potrzebne do istniejących markerów/poleceń, dokumentacja testowa istniejąca w repozytorium wyłącznie jeśli trzeba opisać wymaganą konfigurację

**Intent**: Utrwalić minimalny sposób uruchomienia nowej warstwy bez realnych dostawców i bez ryzyka użycia niewłaściwej bazy.

**Contract**: Testy bez PostgreSQL nadal działają w istniejącym trybie; testy z markerem `postgresql` wymagają jawnego `TEST_DATABASE_URL` dla bazy `_test`. Nie zapisujemy sekretów ani URL-i środowiskowych w repozytorium.

#### 2. Cookbook i zamknięcie planu testów

**Files**: `context/foundation/test-plan.md`, `context/changes/testing-confidentiality-anonymization-boundaries/plan.md`

**Intent**: Zastąpić placeholder §6.1 instrukcją wynikającą z wdrożonych testów i dopisać krótką notatkę fazy. Utrzymać statusy oraz Progress jako jedyne źródło wykonania.

**Contract**: Cookbook wskazuje lokalizację, uruchomienie, wzorzec dwóch kancelarii, fake storage i niezależny manifest PII; nie zawiera kodu testowego ani nie opisuje niezaimplementowanych warstw.

### Success Criteria:

#### Automated Verification:

- Pełny zestaw backendowych testów Pytest przechodzi w konfiguracji dostępnej lokalnie; testy PostgreSQL są uruchomione osobno z jawną bazą `_test`.
- `test-plan.md` ma uzupełnione §6.1 i §6.6, a wszystkie nowe wpisy Progress pozostają jedynym miejscem checkboxów wykonania.
- Zmiana nie wprowadza połączeń z realnym S3, Supabase ani produkcyjną PostgreSQL podczas testów.

#### Manual Verification:

- Recenzent odczytuje cookbook i potwierdza, że nowy test granicy kancelarii można dodać bez kopiowania logiki produkcyjnej.

## Testing Strategy

### Unit Tests:

- Marker reuse, kanonizacja, near-misses i konfliktowe granice sprawdzane względem niezależnego manifestu.
- Walidacja kluczy mappingu oraz zachowanie nieznanych markerów pozostają na warstwie serwisu/anonimizera bez HTTP.

### Integration Tests:

- PostgreSQL: dwie kancelarie, dokument/mapping/reguły kancelarii A oraz odmowa dla B.
- Service + fake storage: prawdziwy PDF/DOCX, szyfrowany mapping i odtworzenie odpowiedzi właściciela.
- Cienka warstwa API: istniejąca generyczna odpowiedź 404 dla obcego/niedostępnego rezultatu bez fake’owania sprawdzanej usługi.

### Manual Testing Steps:

1. Ustawić bezpieczny `TEST_DATABASE_URL` z końcówką `_test`.
2. Uruchomić wybrane testy PostgreSQL i potwierdzić, że próby B nie zmieniają rekordu A.
3. Uruchomić formatowe przypadki PDF/DOCX i sprawdzić manifest, artefakt oraz odtworzenie ownera.
4. Przeczytać zaktualizowany cookbook przed dodaniem następnego testu backendowego.

## Performance Considerations

Testy używają małych syntetycznych dokumentów i fake storage. Nie dodają obciążenia ścieżkom produkcyjnym; czas migracji PostgreSQL pozostaje kosztem tylko oznaczonego zestawu integracyjnego.

## Migration Notes

Brak migracji produkcyjnych. Test fixture uruchamia istniejące migracje wyłącznie przeciwko jawnie wskazanej PostgreSQL `_test`.

## References

- Research: `context/changes/testing-confidentiality-anonymization-boundaries/research.md`
- Test rollout: `context/foundation/test-plan.md`
- Access context: `backend/app/auth.py:36-80`
- Document scope and state: `backend/app/document_repository.py:15-96`
- Mapping and document access: `backend/app/document_service.py:61-264`
- Rules snapshot: `backend/app/office_rule_repository.py:99-113`, `backend/app/office_rule_service.py:151-175`
- Existing PostgreSQL fixture: `backend/tests/conftest.py:20-53`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Trwała granica dokumentu i mapowania

#### Automated

- [x] 1.1 Add two-office PostgreSQL document read and mutation isolation tests — 0608343
- [x] 1.2 Add real-service download and deanonymization denial tests — 0608343
- [x] 1.3 Run selected PostgreSQL integration tests against a `_test` database — 0608343

#### Manual

- [x] 1.4 Confirm the PostgreSQL target is an isolated `_test` database — 0608343

### Phase 2: Granica snapshotu reguł kancelarii

#### Automated

- [x] 2.1 Add two-office active-rule snapshot isolation tests
- [x] 2.2 Add document processing coverage for foreign-rule absence in artifact and mapping
- [x] 2.3 Run rule snapshot integration tests with PostgreSQL and fake storage

#### Manual

- [x] 2.4 Confirm the scenario persists distinct rules rather than faking ownership

### Phase 3: Pełny przepływ PII przez format i mapowanie

#### Automated

- [ ] 3.1 Add an independent five-type PII manifest with variants and near-misses
- [ ] 3.2 Add parameterized PDF/DOCX artifact, mapping, and owner-restoration tests
- [ ] 3.3 Add unit coverage for marker reuse and invalid-value mapping absence

#### Manual

- [ ] 3.4 Confirm expected values are independent of production rules

### Phase 4: Bramka regresji i cookbook

#### Automated

- [ ] 4.1 Document and run the backend regression commands with separated PostgreSQL configuration
- [ ] 4.2 Update the test-plan cookbook with shipped backend test patterns
- [ ] 4.3 Verify no new test path uses real external services

#### Manual

- [ ] 4.4 Confirm the cookbook is sufficient for the next backend boundary test
