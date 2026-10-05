# Anonimizacja z rozszerzenia Chrome — plan implementacji

## Overview

Zbudować S-02: rozszerzenie Chrome Manifest V3 dla pierwszego pilotażu na `http://localhost:3000`, w którym zalogowany prawnik wybiera lokalny PDF/DOCX, uruchamia istniejącą anonimizację backendową i pobiera wyłącznie zanonimizowany wynik, aby samodzielnie załączyć go do aplikacji AI.

## Current State Analysis

Istniejące rozszerzenie jest statycznym prototypem MV3 bez testów. Popup wysyła JSON z nazwą/rozmiarem zamiast rzeczywistego pliku, nie przekazuje tokenu Bearer i nie pobiera wyniku. Ma szerokie `<all_urls>` oraz martwy content script. S-01 dostarcza już chroniony kontrakt `POST /anonymize`, historię oraz krótkotrwały URL wyniku w S3.

## Desired End State

Prawnik otwiera unpacked extension wyłącznie w lokalnej aplikacji AI `http://localhost:3000`, loguje się kontem Supabase, wybiera pojedynczy PDF/DOCX do 10 MB i otrzymuje pobrany zanonimizowany plik. Rozszerzenie przekazuje tylko token Bearer i pole `file` istniejącego kontraktu S-01; nigdy nie przyjmuje lub nie wysyła `office_id`, klucza S3, oryginału przez URL ani mapowania znaczników.

### Key Discoveries:

- Backend wymaga tokenu Bearer, dokładnie jednego multipart `file` i waliduje PDF/DOCX oraz limit 10 MB (`backend/app/main.py:88-121`, `backend/app/document_upload.py:30-64`).
- Panel jest działającym wzorcem: wysyła wyłącznie `file` w `FormData` oraz `Authorization` (`frontend/src/api.js:22-35`, `frontend/src/api.js:72-84`).
- API pobrania zwraca wyłącznie krótkotrwały URL gotowego, własnego wyniku, nie treść oryginału ani mapowanie (`backend/app/main.py:140-152`, `backend/tests/test_document_access.py:71-146`).
- Obecny popup przesyła tylko metadane JSON, a alternatywna ścieżka wysyła pusty formularz do nieistniejącego `/upload` (`chrome-extension/popup.js:16-26`, `chrome-extension/background.js:44-50`).
- `content_scripts` i `<all_urls>` nie realizują ukończonego przepływu i nadmiernie rozszerzają uprawnienia (`chrome-extension/manifest.json:12-15`, `chrome-extension/content.js:6-12`).

## What We're NOT Doing

- Automatycznego załączania pliku, modyfikowania DOM aplikacji AI, wklejania tekstu dokumentu lub komunikowania się z modelem.
- Obsługi publicznych aplikacji AI, innych stron niż `http://localhost:3000`, innych przeglądarek, aplikacji desktopowych oraz publikacji do Chrome Web Store.
- Nowej metody backendowego uwierzytelniania, klientowego `office_id`, bezpośredniego dostępu do oryginału, mapowania albo S3.
- OCR, batch uploadu, plików ponad 10 MB, plików innych niż PDF/DOCX, reguł kancelarii i odwracania znaczników.
- Zmiany wdrożenia: backend i panel pozostają na Fly.io.

## Implementation Approach

Rozszerzenie pozostanie prostym, modułowym klientem MV3. Popup wymaga lokalnej aplikacji AI jako aktywnej karty, uzyskuje sesję e-mail/hasło przez publiczny Supabase Auth API, przechowuje tylko sesję w `chrome.storage.local` ograniczonym do zaufanych kontekstów i używa jej access tokenu w istniejących trasach S-01. Service worker wykonuje upload oraz pobranie; popup pokazuje bezpieczne komunikaty bez odpowiedzi zawierających dane dokumentu.

Konfiguracja unpacked pilota będzie lokalnym plikiem `chrome-extension/config.js`, utworzonym z trackowanego przykładu i ignorowanym przez Git. Zawiera wyłącznie publiczny URL backendu Fly oraz publiczne dane Supabase; nie zawiera poświadczeń AWS, Fernet, service-role ani haseł użytkownika.

## Critical Implementation Details

Ponieważ MV3 zabrania zdalnego wykonywania kodu, auth i klient HTTP muszą być lokalnymi modułami rozszerzenia; nie wolno ładować Supabase SDK z CDN. Host permissions muszą zawierać tylko backend Fly i endpoint Supabase potrzebny do REST Auth. Żądania z service workera wykorzystują manifestowe host permissions, więc nie należy osłabiać backendowego CORS do wildcarda ani dodawać wyjątku `chrome-extension://*`.

## Phase 1: Bezpieczny fundament MV3 i logowanie

### Overview

Zamienić szeroki prototyp w minimalne rozszerzenie unpacked, które działa tylko w kontekście lokalnej aplikacji AI i bezpiecznie tworzy/odnawia sesję Supabase.

### Changes Required:

#### 1. Manifest, konfiguracja i ograniczenie powierzchni

**Files**: `chrome-extension/manifest.json`, `chrome-extension/config.example.js`, `chrome-extension/config.js` (lokalny, ignorowany), `.gitignore`, usunięcie nieużywanego `content.js`/`injected.js`/martwych odwołań

**Intent**: Zastąpić `<all_urls>`, globalny content script i nieużywane uprawnienia najmniejszym zestawem potrzebnym do popupu, pobrania, aktywnej karty, backendu Fly i Supabase Auth.

**Contract**: Manifest MV3 używa modułowego service workera oraz popupu. Pozwala uruchomić przepływ tylko, gdy aktywny URL rozpoczyna się od `http://localhost:3000/`; nie deklaruje `web_accessible_resources`, `clipboardWrite`, `tabs`, `scripting` ani globalnego content script. `config.js` jest nieśledzonym lokalnym modułem z publiczną konfiguracją, a jego przykład nie zawiera wartości prywatnych.

#### 2. Moduły auth i bezpieczne przechowywanie sesji

**Files**: nowe moduły w `chrome-extension/src/`, `chrome-extension/popup.html`, `chrome-extension/popup.js`, nowe testy Node

**Intent**: Dodać ekran logowania/wylogowania w popupie bez dodawania drugiego mechanizmu auth lub przechowywania hasła.

**Contract**: Rozszerzenie używa publicznego Supabase Auth REST API dla e-mail/hasło i odświeżenia tokenu; zapisuje tylko sesję w `chrome.storage.local` po ustawieniu dostępu na `TRUSTED_CONTEXTS`. Klient dostaje tylko aktualny access token, a 401 usuwa sesję i wymaga ponownego logowania. Hasło, token i wartości konfiguracji nie są logowane ani wyświetlane.

### Success Criteria:

#### Automated Verification:

- Testy Node sprawdzają logowanie, odświeżenie i wylogowanie bez zapisu hasła oraz usuwanie sesji po 401.
- Test manifestu potwierdza poprawny JSON, brak `<all_urls>`/content scriptów oraz ograniczone permissions i host permissions.
- `node --check` przechodzi dla skryptów rozszerzenia i `node --test chrome-extension/tests` przechodzi.

#### Manual Verification:

- Unpacked extension z lokalnym `config.js` pokazuje logowanie, a po zalogowaniu pokazuje bezpieczny stan sesji bez tokenu ani hasła.
- Popup odmawia uruchomienia przepływu poza `http://localhost:3000`.

---

## Phase 2: Upload i pobranie zanonimizowanego wyniku

### Overview

Podłączyć popup i service worker do istniejącego kontraktu S-01 bez modyfikowania backendowego API ani automatycznego sterowania stroną AI.

### Changes Required:

#### 1. Klient S-01 i walidacja pliku

**Files**: moduły klienta w `chrome-extension/src/`, `chrome-extension/popup.js`, `chrome-extension/popup.html`, testy Node

**Intent**: Wysyłać prawdziwy plik do istniejącego `POST /anonymize` i blokować błędne pliki lokalnie, zanim trafią do API.

**Contract**: Service worker wysyła dokładnie jeden `FormData` field `file` i `Authorization: Bearer <access token>`; nie ustawia ręcznie multipart `Content-Type`, nie wysyła JSON-metadanych i nie wywołuje `/upload`. Popup przyjmuje wyłącznie PDF/DOCX do 10 MiB, pokazuje stan wysyłania oraz mapuje 401, 403, 422 i błąd sieciowy na komunikaty bez treści dokumentu.

#### 2. Chronione pobranie wyniku

**Files**: moduły klienta w `chrome-extension/src/`, `chrome-extension/background.js`, `chrome-extension/popup.js`, `chrome-extension/popup.html`, testy Node

**Intent**: Po sukcesie pobrać tylko własny, gotowy wynik i pozwolić prawnikowi załączyć go ręcznie do lokalnej aplikacji AI.

**Contract**: Rozszerzenie wywołuje `GET /documents/{document_id}/anonymized-download` tym samym Bearer tokenem, przekazuje otrzymany URL jedynie do `chrome.downloads.download` i zapisuje wynik pod rozpoznawalną nazwą. Nie wywołuje endpointów oryginału, historii jako substytutu pobrania ani S3 API; 404/409/403 nie uruchamia pobrania i daje zrozumiały komunikat.

### Success Criteria:

#### Automated Verification:

- Testy Node potwierdzają dokładny multipart `file`, Bearer token, walidację PDF/DOCX i 10 MiB oraz brak `office_id` i `/upload`.
- Testy Node pokrywają 401/403/422/404 oraz dowodzą, że download zaczyna się tylko po autoryzowanej odpowiedzi wyniku.
- Pełny backendowy zestaw S-01 przechodzi na `_test` PostgreSQL bez zmian kontraktu: `TEST_DATABASE_URL="$TEST_DATABASE_URL" /tmp/anonimizator-venv311/bin/python -m pytest backend/tests -q`.

#### Manual Verification:

- Zalogowany prawnik na `http://localhost:3000` anonimizuje syntetyczny PDF i DOCX do 10 MiB, pobiera wersję ze znacznikami i ręcznie może ją załączyć w lokalnej aplikacji AI.
- Wygasła sesja, nieprawidłowy typ/rozmiar pliku i skan PDF bez warstwy tekstowej pokazują czytelny błąd bez danych dokumentu.

---

## Phase 3: Regresje, instrukcja pilota i granice wdrożenia

### Overview

Utworzyć powtarzalną bramkę dla rozszerzenia oraz instrukcję bezpiecznej konfiguracji unpacked pilota na Fly i Supabase.

### Changes Required:

#### 1. Skrypty testowe i regresje rozszerzenia

**Files**: `chrome-extension/package.json`, `chrome-extension/tests/`, ewentualne małe helpery testowe

**Intent**: Uczynić testy MV3 uruchamialne bez bundlera, zależności zdalnych ani prawdziwych usług.

**Contract**: `npm test` w `chrome-extension/` uruchamia wyłącznie Node built-in test runner z mockami `chrome`, `fetch` i downloadów. Testy nie wymagają prawdziwego Supabase, Fly, S3, konta ani sekretów.

#### 2. Runbook instalacji oraz granice S-02

**Files**: `chrome-extension/README.md`, `README.md`, `docs/environment.md`

**Intent**: Umożliwić uruchomienie unpacked rozszerzenia i testów bez wcześniejszej rozmowy oraz utrwalić Fly jako kanoniczny deploy obecnej wersji.

**Contract**: Dokumentacja opisuje kopię `config.example.js` → lokalny `config.js`, konfigurację wyłącznie publicznego backendu Fly/Supabase, załadowanie unpacked extension i test na `localhost:3000`. Jawnie zabrania wartości AWS/Fernet/service-role, tokenów i haseł w repozytorium oraz opisuje ręczne załączanie pobranego wyniku. Nie deklaruje wsparcia innych stron, automatycznego attachu ani Chrome Web Store.

### Success Criteria:

#### Automated Verification:

- `npm test` w `chrome-extension/` przechodzi z mockami bez usług zewnętrznych.
- Kontrola manifestu i trackowanych plików potwierdza brak `<all_urls>`, content scriptów, konfiguracji lokalnej oraz prywatnych zmiennych S3/Fernet/service-role.
- Backendowy zestaw S-01 i panelowe `npm run test`, `npm run lint`, `npm run build` przechodzą bez regresji.

#### Manual Verification:

- Nowa osoba może skonfigurować `config.js`, załadować rozszerzenie unpacked i wykonać test na `localhost:3000` tylko na podstawie dokumentacji.
- Rozszerzenie działa z aktualnym API Fly, a pobrany wynik jest dodawany do lokalnej aplikacji AI ręcznie, bez automatycznego dostępu do DOM strony.

## Testing Strategy

### Unit Tests:

- Supabase session persistence/refresh/clear oraz brak przechowywania hasła.
- Walidacja typu i rozmiaru pliku, multipart upload, mapowanie statusów API i uruchamianie pobrania.
- Manifest permissions, host permissions oraz brak odwołań do nieistniejących zasobów.

### Integration Tests:

- Obecne backendowe testy S-01 pozostają kontraktem uploadu, office scope i pobrania wyniku.
- Testy rozszerzenia mockują granice Chrome API i HTTP; nie zastępują backendowych testów integracyjnych.

### Manual Testing Steps:

1. Skopiuj `config.example.js` do lokalnego `config.js`, wpisz wyłącznie publiczną konfigurację Fly/Supabase i załaduj unpacked extension.
2. Na `http://localhost:3000` zaloguj się, wyślij syntetyczny PDF/DOCX, pobierz wynik i ręcznie załącz go w aplikacji AI.
3. Sprawdź odmowę działania na innej stronie, wylogowanie/wygaśnięcie sesji oraz błędy typu, limitu i PDF-skanu.
4. Otwórz DevTools rozszerzenia i potwierdź, że logi oraz UI nie pokazują hasła, tokenu, oryginału ani mapowania.

## Performance Considerations

S-02 przekazuje jeden plik do 10 MiB przez istniejący synchroniczny S-01. Rozszerzenie nie buforuje dokumentu poza wybranym plikiem i nie pobiera listy historii; ogranicza to pamięć service workera oraz liczbę żądań.

## Migration Notes

Brak migracji bazy i brak zmiany backendowego API. Istniejący prototyp rozszerzenia jest zastępowany działającym unpacked klientem; lokalny `config.js` jest nowym wymaganiem instalacyjnym i nie może być commitowany.

## References

- `context/foundation/roadmap.md:106-117`
- `context/foundation/prd.md:22-34`
- `chrome-extension/manifest.json:1-60`
- `chrome-extension/background.js:1-53`
- `chrome-extension/popup.js:1-42`
- `backend/app/main.py:76-152`
- `backend/app/auth.py:36-80`
- `backend/app/document_upload.py:10-64`
- `frontend/src/api.js:22-86`
- `docs/environment.md:85-89`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Bezpieczny fundament MV3 i logowanie

#### Automated

- [x] 1.1 Testy auth sesji oraz manifestu rozszerzenia przechodzą bez usług zewnętrznych — a215940
- [x] 1.2 Test manifestu potwierdza ograniczone permissions i host permissions — a215940
- [x] 1.3 Kontrola składni rozszerzenia i `node --test chrome-extension/tests` przechodzą — a215940

#### Manual

- [x] 1.4 Unpacked extension loguje użytkownika bez ekspozycji hasła ani tokenu — a215940
- [x] 1.5 Popup odmawia uruchomienia poza `http://localhost:3000` — a215940

### Phase 2: Upload i pobranie zanonimizowanego wyniku

#### Automated

- [x] 2.1 Testy rozszerzenia pokrywają multipart Bearer upload, limit i brak office_id
- [x] 2.2 Testy rozszerzenia pokrywają bezpieczne pobranie oraz błędy 401/403/422/404
- [x] 2.3 Backendowy zestaw S-01 przechodzi na testowej PostgreSQL bez zmiany kontraktu

#### Manual

- [x] 2.4 Zalogowany prawnik na localhost:3000 anonimizuje PDF/DOCX i ręcznie załącza wynik
- [ ] 2.5 Błędy sesji, typu, limitu i PDF-skanu są czytelne bez ekspozycji danych

### Phase 3: Regresje, instrukcja pilota i granice wdrożenia

#### Automated

- [ ] 3.1 `npm test` rozszerzenia przechodzi z mockami bez usług zewnętrznych
- [ ] 3.2 Kontrola manifestu i plików śledzonych potwierdza brak szerokich uprawnień i sekretów
- [ ] 3.3 Backend oraz panelowe testy, lint i build przechodzą bez regresji

#### Manual

- [ ] 3.4 Nowa osoba uruchamia unpacked extension tylko na podstawie dokumentacji
- [ ] 3.5 Rozszerzenie na Fly pobiera wynik do ręcznego załączenia bez automatycznego dostępu do DOM
