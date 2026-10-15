# Odwracanie znaczników odpowiedzi modelu — plan implementacji

## Overview

S-04 umożliwi prawnikowi przywrócenie oryginalnych wartości w odpowiedzi AI, która zawiera markery zanonimizowanego dokumentu. Funkcja działa wyłącznie dla jednego, jawnie wybranego gotowego dokumentu z historii i używa jego zaszyfrowanego mapowania w granicy zaufanej kancelarii.

## Current State Analysis

Backend zapisuje per dokument deterministyczne mapowanie `marker -> original text` w `Document.encrypted_mapping`, szyfrowane Fernet, ale nie ma żadnego konsumenta odszyfrowania. Dokumenty są już pobierane przez `Document.id` oraz pochodzące z serwera `AccessContext.office_id`; historia i pobieranie wyniku stosują ten wzorzec. Panel ma historię dokumentów oraz klient Bearer API, ale nie ma interfejsu do przekazania odpowiedzi AI ani do wskazania dokumentu jako źródła mapowania.

## Desired End State

Zalogowany prawnik wybiera gotowy dokument z własnej historii, wkleja do 50 000 znaków odpowiedzi AI i otrzymuje tekst, w którym zastąpiono wyłącznie literalne markery znane temu dokumentowi. Nieznane, uszkodzone lub pochodzące z innego dokumentu markery pozostają bez zmian. Tekst wejściowy i wynik nie są zapisywane, wysyłane do storage ani logowane.

### Key Discoveries:

- `get_document_for_access_context()` filtruje dokument po identyfikatorze oraz zaufanym `AccessContext.office_id` (`backend/app/document_repository.py:41-52`), a istniejące usługi dostępu używają go przed zwróceniem danych (`backend/app/document_service.py:180-197`).
- Mapping powstaje jako JSON UTF-8 zaszyfrowany Fernet (`backend/app/document_service.py:84-100`), a `DocumentMappingCipher.decrypt()` zwraca bajty bez mapowania błędów (`backend/app/storage.py:25-41`).
- Markery są literalnymi kluczami, np. `[PESEL_1]`, z oryginalną wartością jako wartością mappingu (`backend/app/anonymization.py:178-186,211-253`).
- Chronione endpointy korzystają z wstrzykiwalnych protokołów serwisów i `Depends(get_current_access_context)` (`backend/app/main.py:29-46,158-222`); frontendowy klient centralnie mapuje bezpieczne błędy HTTP (`frontend/src/api.js:26-97`).
- Aktualne manifest i skrypt kontekstowy rozszerzenia ograniczają je do lokalnej aplikacji; S-04 nie wymaga zmian rozszerzenia (`chrome-extension/manifest.json:1-25`, `chrome-extension/src/context.mjs:1-24`).

## What We're NOT Doing

- Automatycznego odczytu odpowiedzi z witryny AI, dostępu do clipboarda, integracji content scriptu ani zmian w rozszerzeniu Chrome.
- Łączenia markerów z wielu dokumentów, automatycznego wyboru ostatniego dokumentu ani globalnego cache mapowań.
- Zapisu odpowiedzi AI, wyniku deanonymizacji lub wartości mappingu do bazy, S3, historii, analityki albo logów aplikacji.
- Zmiany obcych, nieznanych, uszkodzonych lub niepełnych markerów; nie są one błędami do naprawiania przez ten endpoint.
- Migracji istniejących dokumentów albo odtwarzania mapowań dla dokumentów bez `encrypted_mapping`.

## Implementation Approach

Dodać do granicy dostępu do dokumentu synchroniczny serwis deanonymizacji. Najpierw wykona on office-scoped lookup wybranego dokumentu, dopuści wyłącznie dokument `ready` z mappingiem, odszyfruje i waliduje JSON `dict[str, str]`, a następnie wykona jednoprzebiegową substytucję dokładnych markerów przez `re.sub()` z callable replacement. Endpoint przyjmie tylko `response_text` o długości maksymalnie 50 000 znaków i będzie dla wszystkich niedostępnych mappingów zwracał ten sam bezpieczny rezultat dostępności. Panel pozostanie ręcznym przepływem: lista gotowych dokumentów, textarea wejściowa i tylko lokalny w stanie React wynik.

## Critical Implementation Details

Odszyfrowany mapping i przekazany tekst są danymi wrażliwymi: nie wolno ich przekazywać do `str(error)`, `HTTPException.detail`, loggera, storage ani stanu historii. Błąd Fernet, błąd UTF-8/JSON, zły kształt mappingu, brak mappingu, dokument niegotowy i dokument spoza kancelarii muszą na granicy API dawać ten sam bezpieczny komunikat „wynik niedostępny”.

## Faza 1: Bezpieczny serwis i chronione API

### Overview

Dodać minimalną ścieżkę backendową, która odszyfrowuje mapping tylko po potwierdzeniu własności dokumentu oraz zwraca deanonymizowany tekst bez trwałej retencji.

### Changes Required:

#### 1. Serwis deanonymizacji dokumentu

**Files**: `backend/app/document_service.py`, `backend/tests/test_document_access.py`, `backend/tests/test_document_service.py`

**Intent**: Użyć istniejącego office-scoped lookupu i szyfrowania Fernet do przywracania wyłącznie danych z wybranego dokumentu, bez tworzenia nowej tabeli, migracji albo dostępu do S3.

**Contract**: Dodać wstrzykiwalny serwis/protokół z metodą przyjmującą `AccessContext`, `document_id` i tekst odpowiedzi. Serwis zwraca tylko wynik tekstowy albo sygnalizuje jednolity stan niedostępności; nie rozróżnia dla klienta dokumentu obcego, niegotowego, bez mappingu, z uszkodzonym ciphertextem, nieprawidłowym UTF-8 ani nieprawidłowym JSON. Po walidacji mappingu jako `dict[str, str]` stosuje jedno `re.sub()` z callable `repl` oraz wzorcem z escaped literalnych kluczy, więc wyłącznie pełne znane markery są zastępowane, a nieznane zostają literalnie bez zmian. Serwis nie wywołuje `DocumentStorage` i nie loguje wejścia, wyniku ani mappingu.

#### 2. Kontrakt endpointu i bezpieczne błędy

**Files**: `backend/app/main.py`, `backend/tests/test_document_api_surface.py`, `backend/tests/test_api_access.py`

**Intent**: Udostępnić panelowi jeden chroniony endpoint bez przyjmowania `office_id` ani ujawniania istnienia lub stanu cudzego dokumentu.

**Contract**: Dodać `POST /documents/{document_id}/deanonymize-response` z `Depends(get_current_access_context)`, body JSON `{ "response_text": string }` i sukcesem `{ "response_text": string }`. Walidacja ogranicza wejście do 50 000 znaków i daje bezpieczny `422` bez echa tekstu. Każdy stan niedostępnego mappingu zwraca identyczne `404` z ogólnym komunikatem wyniku niedostępnego; `401` pozostaje obsługą istniejącej sesji. `create_app()` przyjmuje opcjonalny deanonymization processor, tak jak obecne serwisy dokumentów, aby endpoint można było testować bez rzeczywistego klucza, bazy lub storage.

### Success Criteria:

#### Automated Verification:

- Test serwisu potwierdza poprawne odwrócenie znanych markerów z syntetycznego mappingu, niezmienność nieznanych markerów, jeden przebieg substytucji oraz brak wywołań storage.
- Testy serwisu potwierdzają, że dokument innej kancelarii, dokument niegotowy, pusty mapping, wadliwy ciphertext, nieprawidłowy UTF-8 i wadliwy JSON kończą się tym samym stanem niedostępności bez ujawnienia danych.
- Testy API pokrywają Bearer access context, kontrakt JSON, limit 50 000 znaków, bezpieczne `422`, identyczne `404` dla obcego/brakującego/uszkodzonego mappingu oraz brak `office_id` w body.

#### Manual Verification:

- Na syntetycznym dokumencie z historią kancelarii żądanie z odpowiedzią zawierającą `[KLIENT_1]` zwraca oryginalną wartość, a `[NIEZNANY_1]` pozostaje bez zmian.

---

## Faza 2: Ręczny przepływ w panelu kancelarii

### Overview

Pozwolić użytkownikowi jawnie wskazać własny gotowy dokument, wkleić odpowiedź AI i przeczytać wynik bez automatyzacji rozszerzenia oraz bez trwałego zapisu tekstu.

### Changes Required:

#### 1. Klient API deanonymizacji

**Files**: `frontend/src/api.js`, `frontend/src/api.test.js`

**Intent**: Rozszerzyć istniejący centralny klient Bearer API o JSONowy request deanonymizacji i bezpieczne komunikaty właściwe dla tego przepływu.

**Contract**: `createProductApi` dodaje metodę deanonymizacji, która wysyła wyłącznie `{ response_text }` do wybranego `document_id`; nigdy nie wysyła `office_id`, mappingu ani danych z historii poza identyfikatorem wybranego dokumentu. Limit klienta odpowiada limitowi API (50 000 znaków). Dla tego endpointu `404` mapuje się na obecny ogólny błąd wyniku niedostępnego, a `422` na bezpieczny komunikat błędnego tekstu; sieć, token i JSON pozostają pod istniejącym `ApiAccessError`.

#### 2. Stan i interfejs panelu

**Files**: `frontend/src/App.jsx`, `frontend/src/App.css`, `frontend/src/request-generation.js`, `frontend/src/request-generation.test.js`

**Intent**: Dodać prosty panel deanonymizacji do zalogowanego widoku, w którym użytkownik sam wybiera dokument gotowy oraz przekazuje tekst świadomie.

**Contract**: W widoku zalogowanym dodać sekcję z wyborem wyłącznie dokumentów `ready` z już pobranej historii, textarea `response_text` z `maxLength=50000`, przyciskiem uruchamiającym oraz readonly wynikiem renderowanym jako zwykły tekst React. Bez wyboru dokumentu lub gdy nie ma gotowych dokumentów przycisk jest niedostępny. Wynik jest tylko stanem bieżącej sesji i jest czyszczony przy zmianie tożsamości, `401`, lokalnym sign-out oraz zmianie wybranego dokumentu. Handler jest objęty istniejącą generacją żądań, aby spóźniona odpowiedź nie pokazała wartości poprzedniej kancelarii. Nie dodawać clipboarda, localStorage, historii odpowiedzi ani zmian manifestu rozszerzenia.

### Success Criteria:

#### Automated Verification:

- Testy klienta API potwierdzają metodę POST, URL z encoded `document_id`, Bearer token, body wyłącznie z `response_text`, limit 50 000 znaków oraz mapowanie `404`, `422`, sieci i nieprawidłowego JSON na bezpieczne błędy.
- Test regresji generacji żądań dowodzi, że wynik deanonymizacji rozpoczęty w poprzedniej sesji nie może zostać zastosowany po zmianie generacji sesji.
- `npm test`, `npm run lint` i `npm run build` w `frontend/` przechodzą bez nowych ostrzeżeń.

#### Manual Verification:

- Zalogowany użytkownik wybiera gotowy syntetyczny dokument z własnej historii, wkleja odpowiedź z markerami i widzi wynik w panelu bez potrzeby korzystania z rozszerzenia.
- Zmiana wybranego dokumentu, wylogowanie albo odświeżenie sesji usuwa tekst wyniku z panelu.

---

## Faza 3: Izolacja przekrojowa i akceptacja ręczna

### Overview

Zamknąć funkcję testami granic kancelarii oraz ręczną weryfikacją pełnego przepływu na danych syntetycznych.

### Changes Required:

#### 1. Regresje granicy kancelarii i retencji

**Files**: `backend/tests/test_document_access.py`, `backend/tests/test_api_access.py`, `frontend/src/api.test.js`, `frontend/src/request-generation.test.js`

**Intent**: Udowodnić, że endpoint nie daje dostępu do mappingu innej kancelarii i że panel nie zachowuje deanonymizowanego tekstu poza aktualnym kontekstem UI.

**Contract**: Testy A/B kancelarii używają dwóch różnych `AccessContext` oraz syntetycznych markerów i potwierdzają, że tylko właściciel dokumentu dostaje wynik. Scenariusze niedostępności porównują status oraz bezpieczną treść błędu, nie wartości mappingu. Regresje frontendowe obejmują unieważnienie wyniku przy zmianie generacji; testy nie zapisują danych osobowych w fixture’ach.

### Success Criteria:

#### Automated Verification:

- Celowane testy backendu i frontendu pokrywają pełną izolację A/B kancelarii, uszkodzone mappingi, nieznane markery, limit tekstu i unieważnienie wyniku po zmianie sesji.
- Pełny zestaw `pytest`, `npm test`, `npm run lint` i `npm run build` przechodzi w przygotowanych środowiskach projektu.

#### Manual Verification:

- Prawnik na syntetycznym dokumencie wybiera dokument, wkleja odpowiedź z jednym znanym i jednym nieznanym markerem, otrzymuje tylko oczekiwane zastąpienie i może bezpiecznie wylogować się bez pozostawienia wyniku na ekranie.
- Druga syntetyczna kancelaria nie może przywrócić markerów dokumentu pierwszej kancelarii i otrzymuje wyłącznie komunikat o niedostępnym wyniku.

## Testing Strategy

### Unit Tests:

- Odszyfrowanie, walidacja JSON `dict[str, str]`, dokładne dopasowanie escaped markerów oraz brak zastąpienia nieznanych markerów.
- Jednolity błąd dostępności dla wszystkich uszkodzonych lub niedostępnych mappingów.
- Walidacja 50 000 znaków i klient API bez `office_id`.

### Integration Tests:

- Chroniony endpoint z wstrzykniętym serwisem i zaufanym `AccessContext`.
- A/B office isolation przed odszyfrowaniem oraz brak dostępu do storage w ścieżce deanonymizacji.
- Zmiana generacji sesji podczas oczekiwania na odpowiedź API.

### Manual Testing Steps:

1. Prześlij syntetyczny DOCX z frazą `Jan Kowalski`, otrzymaj `[KLIENT_1]`, wybierz ten dokument i wklej `Odpowiedź dla [KLIENT_1] oraz [NIEZNANY_1].`.
2. Potwierdź wynik `Odpowiedź dla Jan Kowalski oraz [NIEZNANY_1].`.
3. Zmień wybrany dokument i potwierdź, że poprzedni wynik znika; wyloguj się i potwierdź, że wynik nie pozostaje na ekranie.
4. Użyj drugiej syntetycznej kancelarii z identyfikatorem dokumentu pierwszej i potwierdź wyłącznie ogólny komunikat niedostępności.

## Performance Considerations

W każdej operacji odszyfrowywany jest tylko mapping jednego jawnie wybranego dokumentu, a długość wejścia jest ograniczona do 50 000 znaków. Jednoprzebiegowe `re.sub()` z callable replacement eliminuje wielokrotne przechodzenie po tekście i nie interpretuje wartości mappingu jako wzorców regex.

## Migration Notes

Brak migracji. Dokumenty historyczne bez `encrypted_mapping` pozostają dostępne do pobierania, ale endpoint deanonymizacji zwraca dla nich ten sam bezpieczny stan niedostępności co dla cudzego lub uszkodzonego dokumentu.

## References

- Research: `context/changes/response-deanonymization/research.md`
- `backend/app/auth.py:36-83`
- `backend/app/document_repository.py:41-82`
- `backend/app/document_service.py:84-100,151-199`
- `backend/app/storage.py:25-41`
- `backend/app/anonymization.py:178-186,211-253`
- `backend/app/main.py:29-46,158-222`
- `frontend/src/api.js:26-146`
- `frontend/src/App.jsx:540-563`
- `backend/tests/test_document_access.py:71-146`
- Context7 `/python/cpython`: `re.sub(pattern, repl, string, count=0, flags=0)` accepts a callable replacement; queried 2026-10-14.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Bezpieczny serwis i chronione API

#### Automated

- [x] 1.1 Test serwisu potwierdza poprawne odwrócenie znanych markerów z syntetycznego mappingu, niezmienność nieznanych markerów, jeden przebieg substytucji oraz brak wywołań storage.
- [x] 1.2 Testy serwisu potwierdzają, że dokument innej kancelarii, dokument niegotowy, pusty mapping, wadliwy ciphertext, nieprawidłowy UTF-8 i wadliwy JSON kończą się tym samym stanem niedostępności bez ujawnienia danych.
- [x] 1.3 Testy API pokrywają Bearer access context, kontrakt JSON, limit 50 000 znaków, bezpieczne `422`, identyczne `404` dla obcego/brakującego/uszkodzonego mappingu oraz brak `office_id` w body.

#### Manual

- [x] 1.4 Na syntetycznym dokumencie z historią kancelarii żądanie z odpowiedzią zawierającą `[KLIENT_1]` zwraca oryginalną wartość, a `[NIEZNANY_1]` pozostaje bez zmian.

### Phase 2: Ręczny przepływ w panelu kancelarii

#### Automated

- [x] 2.1 Testy klienta API potwierdzają metodę POST, URL z encoded `document_id`, Bearer token, body wyłącznie z `response_text`, limit 50 000 znaków oraz mapowanie `404`, `422`, sieci i nieprawidłowego JSON na bezpieczne błędy.
- [x] 2.2 Test regresji generacji żądań dowodzi, że wynik deanonymizacji rozpoczęty w poprzedniej sesji nie może zostać zastosowany po zmianie generacji sesji.
- [x] 2.3 `npm test`, `npm run lint` i `npm run build` w `frontend/` przechodzą bez nowych ostrzeżeń.

#### Manual

- [x] 2.4 Zalogowany użytkownik wybiera gotowy syntetyczny dokument z własnej historii, wkleja odpowiedź z markerami i widzi wynik w panelu bez potrzeby korzystania z rozszerzenia.
- [x] 2.5 Zmiana wybranego dokumentu, wylogowanie albo odświeżenie sesji usuwa tekst wyniku z panelu.

### Phase 3: Izolacja przekrojowa i akceptacja ręczna

#### Automated

- [x] 3.1 Celowane testy backendu i frontendu pokrywają pełną izolację A/B kancelarii, uszkodzone mappingi, nieznane markery, limit tekstu i unieważnienie wyniku po zmianie sesji.
- [x] 3.2 Pełny zestaw `pytest`, `npm test`, `npm run lint` i `npm run build` przechodzi w przygotowanych środowiskach projektu.

#### Manual

- [x] 3.3 Prawnik na syntetycznym dokumencie wybiera dokument, wkleja odpowiedź z jednym znanym i jednym nieznanym markerem, otrzymuje tylko oczekiwane zastąpienie i może bezpiecznie wylogować się bez pozostawienia wyniku na ekranie.
- [x] 3.4 Druga syntetyczna kancelaria nie może przywrócić markerów dokumentu pierwszej kancelarii i otrzymuje wyłącznie komunikat o niedostępnym wyniku.
