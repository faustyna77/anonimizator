# Zarządzanie regułami anonimizacji kancelarii — plan implementacji

## Overview

S-03 doda kancelarii panel do zarządzania dosłownymi frazami i własnymi regexami. Aktywne reguły będą automatycznie stosowane do kolejnego uploadu PDF/DOCX, niezależnie od tego, czy dokument wysłano z panelu czy rozszerzenia Chrome.

## Current State Analysis

Backend anonimuje tylko pięć wbudowanych typów identyfikatorów. Dostęp do dokumentów jest już ograniczony zaufanym `AccessContext.office_id`, a panel oraz rozszerzenie wysyłają tylko plik i token do tego samego endpointu `/anonymize`. Reguły nie mają dziś modelu danych, API, UI ani punktu wstrzyknięcia do adapterów PDF/DOCX.

## Desired End State

Zalogowany użytkownik tworzy, przegląda, edytuje, aktywuje/dezaktywuje i usuwa reguły swojej kancelarii. Reguła zawiera rodzaj (`phrase` albo `regex`), wzorzec i etykietę markera, np. `KLIENT`, która daje `[KLIENT_1]`. Regex MVP opisuje wyłącznie samą wartość do ukrycia — bez kotwic, granic słów ani innego kontekstu — aby jego znaczenie było zgodne z redakcją PDF. Backend pobiera jeden snapshot aktywnych reguł przy rozpoczęciu uploadu i stosuje go bez ujawniania lub przyjmowania `office_id` od klienta.

### Key Discoveries:

- `AccessContext.office_id` pochodzi wyłącznie ze zweryfikowanego użytkownika (`backend/app/auth.py:19-25,61-80`), a repozytorium dokumentów filtruje nim każde zapytanie (`backend/app/document_repository.py:41-95`).
- Reguły wbudowane, marker reuse i rozstrzyganie kolizji są w `backend/app/anonymization.py:75-154`.
- Adaptery PDF/DOCX tworzą własny anonymizer (`backend/app/document_formats.py:23-39,115-132`); muszą otrzymać wspólną, skonfigurowaną instancję z serwisu dokumentów.
- `POST /anonymize` już przekazuje zaufany kontekst do serwisu (`backend/app/main.py:88-121`) i jest wspólnym kontraktem panelu oraz rozszerzenia (`frontend/src/api.js:72-85`, `chrome-extension/src/document-client.mjs:88-110`).
- CORS pozwala teraz tylko na `GET`, `POST`, `OPTIONS` (`backend/app/main.py:76-82`), co blokowałoby RESTowy `PATCH` i `DELETE` z panelu.

## What We're NOT Doing

- Zarządzania regułami w popupie Chrome, cache’owania ich w `chrome.storage` ani przesyłania reguł przez rozszerzenie.
- Współdzielonych kancelarii, importu CSV, wersjonowania/audytu reguł, grup słowników i masowej edycji.
- Automatycznego rozpoznawania imion/nazwisk, OCR i zmieniania mapowań dokumentów już przetworzonych.
- Wykonywania własnych regexów przez standardowy Python `re`.

## Implementation Approach

Jedna tabela `office_anonymization_rules` będzie przechowywać oba rodzaje reguł wraz z kancelarią, etykietą i stanem aktywności. Serwis waliduje wzorzec, buduje niemutowalny snapshot aktywnych reguł i przekazuje skonfigurowany anonymizer do obu adapterów formatów. Panel React użyje istniejącego klienta Bearer API; rozszerzenie pozostaje bez zmian.

## Critical Implementation Details

Własne regexy muszą być kompilowane i wykonywane przez RE2 (`google-re2`) zarówno przy zapisie, jak i podczas ładowania snapshotu. Jedna instancja anonymizera jest używana dla całego dokumentu, aby marker powtarzającej się wartości zachował numer między stronami PDF oraz paragrafami/tabelami/nagłówkami DOCX.

## Phase 1: Model reguł i bezpieczny silnik

### Overview

Dodać trwały model danych kancelarii oraz rozszerzyć anonymizer o bezpieczne frazy i regexy bez regresji pięciu reguł wbudowanych.

### Changes Required:

#### 1. Model, migracja i izolowane repozytorium

**Files**: `backend/app/models.py`, `alembic/versions/<new>_add_office_anonymization_rules.py`, nowy `backend/app/office_rule_repository.py`, `backend/tests/test_models.py`, `backend/tests/test_office_rule_repository.py`

**Intent**: Zapisywać reguły per kancelaria i uniemożliwić odczyt lub zmianę zasobu innej kancelarii.

**Contract**: `office_anonymization_rules` ma UUID, FK `office_id` z `RESTRICT`, `kind` (`phrase|regex`), `pattern`, `marker_label`, `enabled`, daty utworzenia/aktualizacji, indeks `(office_id, enabled)` oraz ograniczenie unikalności `(office_id, kind, pattern)`. Wiele reguł kancelarii może używać tej samej `marker_label`, aby kolejne wartości tworzyły markery jednej kategorii, np. `[KLIENT_1]`, `[KLIENT_2]`. Każde repozytoryjne get/list/update/delete przyjmuje `AccessContext` i filtruje `office_id` w tym samym zapytaniu. Create oraz przejście z `enabled=false` do `true` blokują wiersz kancelarii w tej samej transakcji, liczą aktywne reguły i odrzucają zapis powyżej 50.

#### 2. Bezpieczne, deterministyczne reguły anonimizacji

**Files**: `pyproject.toml`, `backend/requirements.txt`, `backend/app/anonymization.py`, `backend/tests/test_anonymization.py`, nowy test reguł kancelarii

**Intent**: Zastosować aktywne frazy i regexy bez ReDoS, nieprawidłowych markerów albo przypadkowej zmiany działania PESEL/NIP/e-mail/telefon/IBAN.

**Contract**: Dodać `google-re2`; frazy są escapowane i dopasowywane case-insensitive, regexy są kompilowane przez RE2 i nie mogą dopasować pustej wartości. Regex MVP nie może zawierać `^`, `$`, `\b` ani `\B`, więc zawsze opisuje pełną wartość do redakcji, a nie kontekst jej wystąpienia w PDF. Walidacja ogranicza aktywne reguły do 50, frazy do 255 znaków, regexy do 512 znaków i etykietę do `^[A-Z][A-Z0-9_]{0,31}$`; blokuje zastrzeżone etykiety wbudowane. Kolizje rozstrzyga kolejno: najniższy offset, najdłuższe dopasowanie, reguła wbudowana, fraza, regex, stabilne ID. Markery zachowują obecny format i per-dokumentowy reuse.

### Success Criteria:

#### Automated Verification:

- Migracja tworzy poprawne FK, check constraints, indeks i ograniczenie unikalności wzorca dla reguł kancelarii; wiele reguł może współdzielić etykietę markera.
- Testy repozytorium dowodzą, że kancelaria A nie może listować, odczytać, zmienić ani usunąć reguły kancelarii B oraz że równoległe create/enable nie przekracza limitu 50 aktywnych reguł.
- Testy anonimizacji pokrywają frazę, regex, marker, wyłączoną regułę, marker reuse, kolizje, odrzucone regexy kontekstowe i regresję reguł wbudowanych.

#### Manual Verification:

- Nieprawidłowy lub nieobsługiwany regex otrzymuje komunikat bez surowej treści dokumentu.

---

## Phase 2: Chronione API i snapshot w PDF/DOCX

### Overview

Udostępnić CRUD panelowi oraz zastosować tylko aktywne reguły kancelarii przy każdym przetwarzaniu dokumentu.

### Changes Required:

#### 1. Serwis reguł i API

**Files**: nowy `backend/app/office_rule_service.py`, `backend/app/main.py`, `backend/tests/test_api_access.py`, nowe testy API reguł

**Intent**: Umożliwić panelowi bezpieczny CRUD z prostym kontraktem i zachowaniem prywatności kancelarii.

**Contract**: Dodać protokół serwisu reguł oraz opcjonalny `office_rule_service` do `create_app`, aby endpointy miały tę samą wstrzykiwalną granicę testową co serwisy dokumentów. Dodać chronione `GET/POST /office-rules` oraz `PATCH/DELETE /office-rules/{rule_id}` z `Depends(get_current_access_context)`. Parsować body reguł w route/service i zwracać kontrolowane 422 bez `input`, kontekstu walidatora ani surowej treści wzorca. Payloady zawierają wyłącznie `kind`, `pattern`, `marker_label`, `enabled`; nigdy `office_id`. Obcy lub nieistniejący UUID zwraca identyczne 404. CORS rozszerza metody o `PATCH` i `DELETE`, zachowując istniejące originy i nagłówki.

#### 2. Wstrzyknięcie snapshotu do przetwarzania

**Files**: `backend/app/document_service.py`, `backend/app/document_formats.py`, `backend/tests/test_document_service.py`, `backend/tests/test_document_formats.py`

**Intent**: Reguła zapisana przez panel ma działać przy następnym uploadzie z panelu oraz rozszerzenia, bez modyfikacji protokołu klienta.

**Contract**: `DocumentProcessingService` ładuje aktywne reguły dla zaufanego kontekstu raz na dokument przed transformacją. Przekazuje skonfigurowany `DocumentAnonymizer` do `anonymize_pdf` i `anonymize_docx`; adaptery nie tworzą pustej instancji. Wyłączone reguły są widoczne w CRUD, ale nie w snapshotach; ich zmiana wpływa wyłącznie na przyszłe uploady. PDF przyjmuje tylko regexy opisujące wartość samą w sobie; test z powtarzającym się tekstem potwierdza, że redagowane są wyłącznie wartości, które reguła bezkontekstowo dopasowuje.

### Success Criteria:

#### Automated Verification:

- Testy API używają wstrzykniętego serwisu i pokrywają uwierzytelnienie, CRUD, bezpieczne 422 bez echo wzorca, 404 dla obcej kancelarii, brak `office_id` i preflight CORS dla `PATCH`/`DELETE`.
- Testy PDF/DOCX potwierdzają zastosowanie fraz i regexów, brak działania reguł wyłączonych, powtarzające się wartości PDF oraz zachowanie mapowania w całym dokumencie.
- Po przygotowaniu Python 3.11, zależności dev/backend i `TEST_DATABASE_URL` kończącego się na `_test`, pełny backendowy zestaw testów przechodzi.

#### Manual Verification:

- Reguła dodana w panelu wpływa na następny upload z rozszerzenia bez jego przeładowania.

---

## Phase 3: Panel reguł kancelarii

### Overview

Dodać do istniejącego widoku zalogowanej kancelarii prosty interfejs CRUD dla dwóch rodzajów reguł.

### Changes Required:

#### 1. Klient API i interfejs panelu

**Files**: `frontend/src/api.js`, `frontend/src/api.test.js`, `frontend/src/App.jsx`, `frontend/src/App.css`

**Intent**: Prawnik zarządza frazami i regexami z jednego panelu oraz otrzymuje jasną informację o błędzie zapisu.

**Contract**: `createProductApi` dodaje list/create/update/delete reguły i zawsze stosuje istniejący Bearer token. Zalogowany widok ma osobne formularze/listy fraz i regexów z etykietą markera, przełącznikiem aktywności, edycją i potwierdzonym usuwaniem. Komunikaty stosują istniejące `role=status|alert`; 401 czyści reguły razem z dokumentami. Payload klienta nigdy nie zawiera `office_id`.

### Success Criteria:

#### Automated Verification:

- Testy API klienta weryfikują metody, payloady bez `office_id`, Bearer token i mapowanie błędów CRUD.
- `npm test`, `npm run lint` i `npm run build` w `frontend/` przechodzą; interakcje formularzy oraz komunikaty `role=status|alert` są jawnie zweryfikowane ręcznie, ponieważ projekt nie ma jeszcze środowiska testów DOM.

#### Manual Verification:

- Użytkownik tworzy frazę `Jan Kowalski` z etykietą `KLIENT`, tworzy regex numeru sprawy, przełącza jego aktywność i widzi oczekiwany wynik następnego uploadu.

## Testing Strategy

### Unit Tests:

- Walidacja etykiet i granic długości, RE2, zakaz pustych oraz kontekstowych dopasowań i zastrzeżone marker labels.
- Case-insensitive frazy, pełne dopasowanie regexu, kolejność kolizji i per-dokumentowe markery.
- Kontrolowane 422 bez echa wzorca oraz transakcyjny limit 50 aktywnych reguł.

### Integration Tests:

- Migracja i izolacja A/B kancelarii dla każdej operacji CRUD.
- Jeden snapshot aktywnych reguł dla PDF i DOCX oraz wspólny kontrakt uploadu panelu/rozszerzenia.

### Manual Testing Steps:

1. Utwórz frazę `Jan Kowalski` z etykietą `KLIENT` i potwierdź `[KLIENT_1]` w syntetycznym PDF oraz DOCX.
2. Utwórz regex numeru sprawy z etykietą `NUMER_SPRAWY`, wyłącz go i potwierdź, że kolejny upload nie zastępuje numeru.
3. Zaloguj drugą kancelarię i potwierdź brak widoczności oraz brak możliwości modyfikacji reguł pierwszej.
4. Wyślij dokument z rozszerzenia i potwierdź działanie aktualnie aktywnej reguły utworzonej w panelu.

## Performance Considerations

Maksymalnie 50 aktywnych reguł jest ładowanych jednym zapytaniem na dokument i kompilowanych przez bezpieczny silnik. Reguły nie są przechowywane po stronie rozszerzenia ani ładowane przy starcie aplikacji.

## Migration Notes

Migracja dodaje puste tabele i nie zmienia obecnych dokumentów, ich zaszyfrowanych mapowań ani pięciu reguł wbudowanych. Downgrade usuwa indeks i tabelę w kolejności zgodnej z FK. Przed pełną weryfikacją backendową należy użyć Python 3.11, zainstalować zależności backend/dev oraz wskazać `TEST_DATABASE_URL` dla PostgreSQL z nazwą bazy kończącą się na `_test`.

## References

- `backend/app/auth.py:19-25,61-80`
- `backend/app/models.py:26-113`
- `backend/app/document_repository.py:41-95`
- `backend/app/anonymization.py:75-154`
- `backend/app/document_service.py:53-117`
- `backend/app/document_formats.py:23-39,115-132`
- `backend/app/main.py:76-121`
- `frontend/src/api.js:22-86`
- `frontend/src/App.jsx:114-150,206-260`
- `chrome-extension/src/document-client.mjs:88-110`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Model reguł i bezpieczny silnik

#### Automated

- [x] 1.1 Migracja i repozytorium izolują reguły oraz limit 50 per kancelaria
- [x] 1.2 Silnik obsługuje bezpieczne bezkontekstowe frazy, regexy, markery i kolizje
- [x] 1.3 Testy modelu, repozytorium i anonimizacji przechodzą

#### Manual

- [x] 1.4 Nieprawidłowy regex zwraca bezpieczny komunikat

### Phase 2: Chronione API i snapshot w PDF/DOCX

#### Automated

- [ ] 2.1 Wstrzykiwane API CRUD chroni dane i ukrywa błędne wzorce
- [ ] 2.2 PDF/DOCX stosują jeden snapshot aktywnych reguł bez błędnej redakcji duplikatów
- [ ] 2.3 Pełny backendowy zestaw przechodzi po przygotowaniu Python 3.11 i PostgreSQL

#### Manual

- [ ] 2.4 Zmiana panelu wpływa na upload rozszerzenia bez jego przeładowania

### Phase 3: Panel reguł kancelarii

#### Automated

- [ ] 3.1 Klient frontendowy obsługuje bezpieczny CRUD reguł
- [ ] 3.2 Testy i bramki frontendowe przechodzą

#### Manual

- [ ] 3.3 Panel zarządza regułami, a upload stosuje wynik
