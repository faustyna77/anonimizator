# Testy bezpieczeństwa panelu i odpowiedzi — plan implementacji

## Overview

Domknąć Fazę 3 rolloutu testów: sprawdzić zachowanie panelu przy awarii API/CORS oraz zagwarantować, że deanonymizacja nie ujawni części danych z uszkodzonego markera ani z niepoprawnego mapowania.

## Current State Analysis

Backend używa mapowania markerów powiązanego z kancelarią i obecnie podmienia literalny, znany marker nawet wtedy, gdy stanowi fragment dłuższego tokenu. Walidacja odszyfrowanego mapowania dopuszcza puste wartości (`backend/app/document_service.py:161-202`).

Panel centralnie klasyfikuje błędy API jako bezpieczne komunikaty, lecz klient przyjmuje dowolny poprawny JSON w odpowiedzi deanonymizacji; wynik pusty albo o złym kształcie nie ma jawnego stanu błędu (`frontend/src/api.js:27-103`, `133-145`; `frontend/src/App.jsx:447-482`, `709-715`). Obecne testy CORS obejmują preflight PATCH/DELETE, nie POST deanonymizacji (`backend/tests/test_api_access.py:343-365`).

## Desired End State

Deanonymizacja zastępuje wyłącznie autonomiczne, niezmienione markery z poprawnego niepustego mapowania wybranego dokumentu kancelarii. Uszkodzone mapowania i marker z przylegającym tekstem nie prowadzą do częściowego ujawnienia wartości PII.

Panel pokazuje wyłącznie poprawny wynik `response_text` albo bezpieczny komunikat błędu. Kontrakty CORS dla autoryzowanego JSON POST są deterministycznie testowane, a późniejszy browser smoke używa wyłącznie syntetycznego dokumentu.

### Key Discoveries:

- Endpoint deanonymizacji wymaga dokładnie `{ "response_text": string }` i scala wszystkie niedostępne mapowania do ogólnego 404 (`backend/app/main.py:241-269`).
- CORS dopuszcza jawnie skonfigurowane originy, `Authorization` oraz `Content-Type`; JSONowy POST wymaga preflight w przeglądarce (`backend/app/main.py:119-125`, `frontend/src/api.js:140-144`).
- Aktualne literalne dopasowanie podmienia `[KLIENT_1]` wewnątrz `[KLIENT_1]suffix`, a wartości mappingu mogą być puste (`backend/app/document_service.py:184-202`).
- Użytkownik delegował decyzje bezpieczeństwa: marker z przylegającym tekstem pozostaje cały bez zmian, a pusta wartość mappingu oznacza wynik niedostępny (`context/changes/testing-panel-response-safety/research.md:29-32`, `54-56`).

## What We're NOT Doing

- Nie zmieniamy schematu bazy, sposobu szyfrowania mappingu, endpointów ani modelu autoryzacji.
- Nie dodajemy szerokiego frameworka E2E, automatycznego logowania do produkcji ani testów na rzeczywistych dokumentach.
- Nie odczytujemy ani nie zapisujemy sekretów, tokenów, odszyfrowanych mappingów lub treści dokumentów podczas testów.
- Nie zmieniamy nieznanych markerów ani poprawnych znanych markerów obok zwykłej interpunkcji.

## Implementation Approach

Najpierw ustanowić niezależną wyrocznię bezpieczeństwa w serwisie deanonymizacji i jego testach jednostkowych. Następnie domknąć kontrakty HTTP/CORS oraz walidację odpowiedzi po stronie klienta przez istniejące Pytest/Vitest. Na końcu uruchomić pełne bramki i wykonać minimalny smoke w rzeczywistej przeglądarce, gdy dostępna jest uwierzytelniona syntetyczna sesja.

## Critical Implementation Details

Marker podlega odtworzeniu wyłącznie, jeśli nie jest bezpośrednio przyległy do litery, cyfry, `_` lub nawiasu kwadratowego; zwykła interpunkcja i odstępy nie zmieniają markera. To odróżnia token `[KLIENT_1]suffix` od poprawnego zdania `([KLIENT_1]).` bez wprowadzania parsera odpowiedzi AI.

## Faza 1: Integralność markerów i mappingu

### Overview

Ustalić w serwisie domenowy kontrakt dla bezpiecznego przywracania wartości oraz regresje, które wykryją częściowe ujawnienie PII.

### Changes Required:

#### 1. Walidacja mappingu i granice substytucji

**Files**: `backend/app/document_service.py`, `backend/tests/test_document_access.py`

**Intent**: Zablokować częściowe odtworzenie markera z doczepioną treścią i potraktować puste wartości mappingu jako uszkodzony stan, zanim wynik dotrze do endpointu.

**Contract**: `ResponseDeanonymizationService` zwraca `None` dla odszyfrowanego mappingu z pustą wartością. Przy substytucji podmienia wyłącznie znane markery nieprzylegające bezpośrednio do litery, cyfry, `_` ani `[`/`]`; znane markery obok spacji lub interpunkcji pozostają odtwarzalne. Nieznane i zmienione markery pozostają literalnie w odpowiedzi.

#### 2. Regresje serwisu dla wartości bezpiecznych i wadliwych

**Files**: `backend/tests/test_document_access.py`

**Intent**: Użyć syntetycznego szyfrowanego mappingu jako niezależnej wyroczni dla poprawnych markerów, nieznanych markerów, markerów z prefiksem/sufiksem oraz pustych wartości.

**Contract**: Testy obejmują pełny znany marker, nieznany marker, marker zmieniony wewnątrz, marker z prefiksem lub sufiksem alfanumerycznym, marker obok interpunkcji oraz mapping z pustą wartością. Testy oznaczają niedostępne mapowanie przez zwrot `None`, bez przechwytywania treści PII z błędów.

### Success Criteria:

#### Automated Verification:

- `backend/tests/test_document_access.py` potwierdza odtworzenie wyłącznie autonomicznych znanych markerów i niezmienność markerów nieznanych lub z sąsiednim tekstem.
- Ten sam moduł potwierdza, że mapping z pustą wartością jest niedostępny oraz że istniejące uszkodzone mappingi zachowują wynik `None`.
- `.venv/bin/python3.11 -m pytest -q backend/tests/test_document_access.py` przechodzi.

#### Manual Verification:

- Przegląd testowych łańcuchów potwierdza, że używają wyłącznie danych syntetycznych i żadna asercja nie pobiera reguły markerów z kodu produkcyjnego.

---

## Faza 2: Kontrakty CORS oraz odpowiedzi klienta

### Overview

Utrwalić autoryzowany JSON POST deanonymizacji na granicy HTTP i wyeliminować milczące zaakceptowanie nieprawidłowego sukcesu przez panel.

### Changes Required:

#### 1. Preflight i bezpieczne HTTP API

**Files**: `backend/tests/test_api_access.py`

**Intent**: Udowodnić, że dozwolony origin może wysłać preflight dla POST deanonymizacji z Bearer/JSON, a niedozwolony origin nie otrzymuje zezwalających nagłówków CORS.

**Contract**: Testy używają `TestClient` i skonfigurowanego originu testowego. Dla dozwolonego preflightu sprawdzają `POST`, `Authorization` i `Content-Type`; dla niedozwolonego originu nie zakładają szczegółowego tekstu middleware, tylko brak zezwalającego nagłówka originu. Endpoint zachowuje obecne jednolite 422/404 bez echa `response_text` lub mappingu.

#### 2. Ścisły klient deanonymizacji

**Files**: `frontend/src/api.js`, `frontend/src/api.test.js`, `frontend/src/App.jsx`

**Intent**: Wymagać od odpowiedzi sukcesu jednoznacznego łańcucha `response_text`, aby brak pola, `null` albo inny typ nie był renderowany jako pozornie pusty wynik.

**Contract**: Klient API waliduje odpowiedź tej jednej metody po sparowaniu JSON i zamienia nieprawidłowy sukces na istniejący bezpieczny `ApiAccessError`. Stan panelu rozróżnia brak wyniku od poprawnego pustego tekstu, aby komponent nie ukrywał zaakceptowanej wartości przez warunek truthy. Błąd transportu/CORS pozostaje `REQUEST_FAILED` i nie wylogowuje bieżącej sesji.

#### 3. Deterministyczne regresje klienta

**Files**: `frontend/src/api.test.js`

**Intent**: Pokryć ten sam bezpieczny kontrakt bez pełnego DOM lub zależności E2E.

**Contract**: Tabelaryczne testy obejmują odrzucony `fetch` dla listy dokumentów i deanonymizacji, 404/422 deanonymizacji, JSON bez `response_text`, `null`, obiekt zamiast łańcucha oraz poprawny pusty łańcuch. Każdy błąd porównuje stały kod i komunikat bez treści odpowiedzi serwera.

### Success Criteria:

#### Automated Verification:

- `backend/tests/test_api_access.py` potwierdza poprawny preflight POST deanonymizacji dla dozwolonego originu i brak zezwalającego originu dla niedozwolonego.
- `frontend/src/api.test.js` potwierdza walidację `response_text`, bezpieczne błędy transportu oraz brak wycieku danych z błędnej odpowiedzi.
- `cd frontend && npm test && npm run lint && npm run build` przechodzi.

#### Manual Verification:

- W lokalnym panelu kontrolowana awaria sieci lub CORS pokazuje ogólny komunikat błędu i pozostawia użytkownika zalogowanego.
- Poprawna odpowiedź z pustym `response_text` jest rozróżnialna od braku odpowiedzi, bez wyświetlania treści błędu serwera.

---

## Faza 3: Bramka regresji i browser smoke

### Overview

Potwierdzić, że deterministyczne regresje nie naruszają istniejących granic kancelarii, a rzeczywista przeglądarka zachowuje kontrakt panel–API.

### Changes Required:

#### 1. Pełne bramki lokalne

**Files**: `context/foundation/test-plan.md`, `context/changes/testing-panel-response-safety/plan.md`

**Intent**: Uruchomić i zapisać w Progress komplet weryfikacji backendu, frontendu i rozszerzenia dla tej fazy, bez mieszania poprzednich brudnych zmian z jej zakresem.

**Contract**: Backend testuje się przez Python 3.11; testy PostgreSQL dostają tymczasowy loopback `TEST_DATABASE_URL` dla bazy zakończonej `_test`. Frontend i rozszerzenie korzystają z istniejących skryptów `npm test`; żaden gate nie używa chmurowej bazy, storage ani dokumentu produkcyjnego.

#### 2. Ukierunkowany smoke CORS/deanonymizacji

**Files**: no production file changes expected

**Intent**: Sprawdzić jedyną granicę, której mockowane testy nie dowodzą: prawdziwy origin panelu i przeglądarkowy preflight.

**Contract**: Gdy dostępna jest skonfigurowana uwierzytelniona sesja testowa, smoke używa wyłącznie syntetycznego dokumentu i wklejonej syntetycznej odpowiedzi. Potwierdza sukces z dozwolonego originu oraz bezpieczny błąd dla kontrolowanego niedozwolonego originu, bez pokazywania tokenu, mappingu ani danych dokumentu. Brak takiej sesji pozostawia ręczny krok oczekujący; nie wymaga się podawania poświadczeń w czacie.

### Success Criteria:

#### Automated Verification:

- `.venv/bin/python3.11 -m pytest -q -m "not postgresql"` przechodzi.
- Testy oznaczone `postgresql` przechodzą z jednorazową lokalną bazą `_test`, a kontener jest usunięty po bramce.
- `cd frontend && npm test && npm run lint && npm run build` oraz `cd chrome-extension && npm test` przechodzą.

#### Manual Verification:

- Zalogowany użytkownik testowy na dozwolonym originie panelu używa syntetycznego dokumentu i widzi tylko oczekiwane odtworzenie całego markera.
- Próba z niedozwolonego originu kończy się bezpiecznym komunikatem panelu i nie ujawnia tokenu, mappingu ani wartości PII.

## Testing Strategy

### Unit Tests:

- Granice pełnego markera, markera z sąsiadującym tekstem, nieznanego markera i wartości pustego mappingu.
- Walidacja odpowiedzi `response_text` po stronie klienta oraz bezpieczne mapowanie błędów transportu.

### Integration Tests:

- FastAPI `TestClient` dla CORS preflight POST i jednolitych błędów deanonymizacji.
- Pełny backendowy zestaw Pytest, w tym istniejąca izolacja kancelarii na jednorazowej PostgreSQL.

### Manual Testing Steps:

1. Otwórz panel z dozwolonego originu i zaloguj się wyłącznie testowym kontem.
2. Wybierz syntetyczny gotowy dokument i wklej odpowiedź zawierającą pełny znany marker, nieznany marker oraz marker z doczepionym tekstem.
3. Potwierdź, że odtwarza się wyłącznie pełny marker; pozostałe dwa łańcuchy pozostają literalne.
4. Wykonaj kontrolowany test niedozwolonego originu i potwierdź ogólny błąd bez automatycznego wylogowania.

## Performance Considerations

Walidacja mappingu pozostaje liniowa względem liczby wpisów, a substytucja pojedynczym przejściem przez odpowiedź. Nie dodaje retencji ani dodatkowych wywołań storage/bazy poza istniejącym odczytem wybranego dokumentu.

## Migration Notes

Brak migracji. Historyczne mappingi z pustymi wartościami stają się bezpiecznie niedostępne i zwracają istniejący ogólny 404.

## References

- Research: `context/changes/testing-panel-response-safety/research.md`
- Test rollout: `context/foundation/test-plan.md`
- `backend/app/document_service.py:161-202`
- `backend/app/main.py:119-125,241-269`
- `backend/tests/test_document_access.py:173-251`
- `backend/tests/test_api_access.py:189-268,343-365`
- `frontend/src/api.js:27-103,133-145`
- `frontend/src/api.test.js:112-195`
- `frontend/src/App.jsx:447-482,709-715`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Integralność markerów i mappingu

#### Automated

- [x] 1.1 Enforce isolated known-marker substitution and reject empty mapping values — d9f20dd
- [x] 1.2 Add service regressions for altered, unknown, and unavailable mappings — d9f20dd
- [x] 1.3 Run focused deanonymization service tests — d9f20dd

#### Manual

- [x] 1.4 Confirm synthetic fixtures do not derive marker rules from production code — d9f20dd

### Phase 2: Kontrakty CORS oraz odpowiedzi klienta

#### Automated

- [x] 2.1 Add deanonymization POST CORS contract coverage — 19e740d
- [x] 2.2 Validate deanonymization success payloads in the frontend client — 19e740d
- [x] 2.3 Add frontend regressions and run frontend quality gates — 19e740d

#### Manual

- [x] 2.4 Confirm transport failure retains the active session and renders safe feedback — 19e740d
- [x] 2.5 Confirm empty valid output is distinguishable from unavailable output — 19e740d

### Phase 3: Bramka regresji i browser smoke

#### Automated

- [x] 3.1 Run backend unit and PostgreSQL integration gates on isolated local infrastructure — 7238e98
- [x] 3.2 Run frontend and extension regression gates — 7238e98

#### Manual

- [x] 3.3 Smoke the allowed-origin deanonymization flow with synthetic data — 7238e98
- [x] 3.4 Confirm a disallowed-origin attempt exposes no confidential data — 7238e98
