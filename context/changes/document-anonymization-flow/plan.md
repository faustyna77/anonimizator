# Przepływ anonimizacji dokumentu — plan implementacji

## Overview

Zbudować pierwszy pełny przepływ S-01: zalogowany prawnik przesyła jeden PDF albo DOCX, backend przypisuje dokument do kancelarii wyłącznie z `AccessContext`, wykrywa PESEL, NIP, e-mail, telefon i IBAN, a następnie zwraca oraz zapisuje zanonimizowaną wersję w tym samym formacie. Oryginał i wynik są przechowywane w AWS S3, a zaszyfrowane mapowanie znaczników pozostaje w PostgreSQL na Fly dla późniejszego S-04.

## Current State Analysis

F-01 dostarcza serwerowo zweryfikowaną tożsamość oraz kancelarię (`backend/app/auth.py:61-83`), ale `POST /anonymize` nadal jest statycznym stubem (`backend/app/main.py:31-34`). Repo ma `pdfplumber` i `python-docx` (`backend/requirements.txt:3-4`), bez uploadu multipart, ekstrakcji, transformacji, modeli dokumentów, integracji S3 ani historii w panelu. Panel ma sesję Supabase i centralny klient API (`frontend/src/App.jsx:26-131`, `frontend/src/api.js:9-44`).

## Desired End State

Zalogowany użytkownik może przesłać pojedynczy plik PDF lub DOCX do 10 MB, zobaczyć wynik anonimizacji oraz później pobrać wersję zanonimizowaną z własnej historii dokumentów. Wynik zachowuje format wejściowy; PDF zachowuje strony i układ możliwie blisko oryginału, a PDF bez warstwy tekstowej jest odrzucany z czytelnym komunikatem. Każdy dokument, plik i wpis historii jest dostępny wyłącznie w granicy kancelarii wyprowadzonej przez backend.

### Key Discoveries:

- `get_current_access_context` wyprowadza `office_id` z profilu serwerowo; S-01 nie może przyjmować go od klienta (`backend/app/auth.py:61-75`, `docs/environment.md:52-54`).
- Modele obejmują wyłącznie kancelarie i profile (`backend/app/models.py:15-41`), więc dokumenty, wyniki i mapowania wymagają migracji.
- `pdfplumber` odczytuje PDF, ale nie zapisuje redakcji; PDF wymaga narzędzia zdolnego do redakcji i nakładania znacznika. `python-docx` wymaga obsługi akapitów, tabel oraz nagłówków i stopek.
- Fly nie zapewnia właściwego trwałego miejsca na pliki; wcześniejszy plan wdrożenia wyklucza local volume dla dokumentów (`context/deployment/deploy-plan.md:31`).
- Testy F-01 mają wzorzec izolowanej PostgreSQL `_test` oraz testowania granicy kancelarii (`backend/tests/conftest.py:21-57`, `backend/tests/test_access_isolation.py:13-46`).

## What We're NOT Doing

- OCR, obsługi skanowanych PDF bez warstwy tekstowej, innych języków oraz automatycznego wykrywania imion i nazwisk.
- Uploadu wsadowego, plików większych niż 10 MB, kolejki zadań ani asynchronicznego przetwarzania.
- Logowania, transferu plików ani zmian UX rozszerzenia Chrome — to S-02.
- Edycji reguł kancelarii, ręcznej korekty znaczników i odwracania odpowiedzi modelu — to S-03/S-04.
- Eksponowania oryginału lub zaszyfrowanego mapowania do klienta oraz bezpośredniego dostępu klienta do S3.
- Automatycznej polityki usuwania dokumentów; użytkownik wybrał zachowanie oryginału i wyniku.

## Implementation Approach

Backend zastąpi stub `/anonymize` chronionym endpointem multipart. Po walidacji jednego pliku zapisze oryginał w AWS S3 pod kluczem pochodzącym od kancelarii i dokumentu, przetworzy plik synchronicznie, zapisze wynik w S3 oraz metadane i zaszyfrowane mapowanie w PostgreSQL. Pobranie wyniku będzie możliwe wyłącznie po sprawdzeniu kancelarii przez backend; backend wygeneruje krótkotrwały link S3 dopiero po tej kontroli.

Znaczniki mają postać `[PESEL_1]`, `[NIP_1]`, `[EMAIL_1]`, `[TELEFON_1]`, `[IBAN_1]`, są numerowane od nowa dla każdego dokumentu i każdego typu danych. Panel użyje istniejącej sesji Supabase i klienta API do przesłania `FormData`, pokazania wyniku oraz listy własnych dokumentów.

## Critical Implementation Details

Oryginał, wynik, zaszyfrowane mapowanie i metadane muszą powstać pod serwerowo wyprowadzonym `office_id`; żaden identyfikator kancelarii, klucz S3 ani mapowanie nie może pochodzić z żądania klienta. Błąd przetwarzania może zapisać status techniczny, ale nie może zwrócić ani zalogować niezanonimizowanej treści dokumentu.

## Phase 1: Dane dokumentu i granica storage

### Overview

Wprowadzić model dokumentu, konfigurację S3 i zaszyfrowane mapowanie, zanim endpoint zacznie przyjmować dane poufne.

### Changes Required:

#### 1. Konfiguracja S3 i szyfrowania

**Files**: `backend/requirements.txt`, `pyproject.toml`, `backend/app/config.py`, `.env.example`, `docs/environment.md`, nowy moduł storage

**Intent**: Dodać server-only konfigurację AWS S3 i klucza szyfrowania mapowań oraz mały adapter storage izolujący SDK od tras API.

**Contract**: Konfiguracja wymaga bucketu, regionu, poświadczeń S3 i klucza szyfrowania wyłącznie dla tras dokumentów; żadna wartość nie trafia do `VITE_*`, plików śledzonych ani odpowiedzi API. Adapter przyjmuje wyłącznie klucz utworzony serwerowo, zapisuje/odczytuje obiekty i tworzy krótkotrwały link pobrania wyniku.

#### 2. Metadane dokumentu i migracja

**Files**: `backend/app/models.py`, nowy moduł repozytorium dokumentów, `alembic/versions/<revision>_add_documents.py`, testy modeli

**Intent**: Zapisać własność kancelarii, właściciela uploadu, format, rozmiar, status, klucze oryginału i wyniku oraz zaszyfrowane mapowanie bez przechowywania treści pliku w PostgreSQL.

**Contract**: Dokument ma FK do `offices` i profil uploadujący, indeks kancelarii oraz nieudostępniane klientowi zaszyfrowane mapowanie. Statusy rozróżniają co najmniej przetwarzanie, gotowość i błąd; repozytorium zawsze filtruje operacje po `office_id` z `AccessContext`.

### Success Criteria:

#### Automated Verification:

- Migracja dokumentów przechodzi na lokalnej/testowej PostgreSQL i tworzy wymagane ograniczenia własności kancelarii.
- Testy konfiguracji odrzucają brak wymaganych wartości S3/szyfrowania bez ujawniania ich wartości.
- Test adaptera storage nie używa rzeczywistego AWS i dowodzi, że klucz obiektu zawiera serwerowo pochodzący identyfikator kancelarii.

#### Manual Verification:

- Przykładowa konfiguracja jasno rozdziela publiczne wartości panelu od sekretów backendu S3 i szyfrowania.

---

## Phase 2: Chroniony upload i silnik anonimizacji

### Overview

Zastąpić stub rzeczywistym, synchronicznym przetwarzaniem pojedynczego PDF/DOCX oraz zapisać wynik i mapowanie w granicy kancelarii.

### Changes Required:

#### 1. Walidacja uploadu i kontrakt endpointu

**Files**: `backend/app/main.py`, nowe schematy/serwisy dokumentów, testy API

**Intent**: Przyjąć pojedynczy multipart PDF/DOCX do 10 MB wyłącznie od zalogowanego użytkownika i zwrócić metadane gotowego wyniku albo bezpieczny błąd walidacji/przetwarzania.

**Contract**: `POST /anonymize` pozostaje chronioną trasą i wymaga `AccessContext`; nie przyjmuje `office_id`. Odrzuca brak pliku, wiele plików, niedozwolone rozszerzenie/MIME, pustą treść i plik większy niż 10 MB. Odpowiedź nie zawiera oryginalnej treści ani zaszyfrowanego mapowania.

#### 2. Wykrywanie oraz mapowanie znaczników

**Files**: nowy moduł anonimizacji, testy jednostkowe z syntetycznymi danymi

**Intent**: Wykryć PESEL, NIP, e-mail, telefon i IBAN, zweryfikować format gdzie jest to możliwe oraz zamienić każdą unikalną wartość na deterministyczny znacznik w granicy dokumentu.

**Contract**: Każdy typ używa własnego licznika zaczynającego się od 1; identyczna wartość w tym samym dokumencie dostaje ten sam znacznik. Mapowanie jest szyfrowane przed zapisem i nigdy nie wraca przez endpointy S-01.

#### 3. Transformacja PDF i DOCX oraz zapis wyniku

**Files**: nowe adaptery PDF/DOCX, serwis dokumentu, testy formatów

**Intent**: Zachować format źródłowy podczas anonimizacji: PDF z zachowaniem stron i możliwie zbliżonego układu, DOCX z obsługą tekstu w akapitach, tabelach, nagłówkach i stopkach.

**Contract**: PDF bez używalnej warstwy tekstowej kończy się kontrolowanym błędem bez OCR. Wynik jest zapisany w S3 pod kancelarią i dokumentem, a rekord dokumentu przechodzi na gotowy albo błąd; oryginał pozostaje zapisany zgodnie z decyzją użytkownika.

### Success Criteria:

#### Automated Verification:

- Testy API dowodzą 401 bez tokenu, odrzucenie nieprawidłowego/za dużego uploadu oraz sukces dla kontrolowanego `AccessContext`.
- Testy jednostkowe pokrywają wszystkie pięć klas danych, powtarzające się wartości i numerację od nowa w drugim dokumencie.
- Testy formatów tworzą syntetyczny DOCX i PDF z warstwą tekstową, a wyniki zachowują format oraz nie zawierają wykrytych danych źródłowych.
- Testy integracyjne zapisują metadane oraz obiekty przez fałszywy adapter S3, bez połączenia z AWS.

#### Manual Verification:

- Zalogowany użytkownik przesyła syntetyczny PDF i DOCX do 10 MB, otrzymuje wynik w tym samym formacie i widzi znaczniki pięciu typów danych.
- Skanowany PDF bez warstwy tekstowej pokazuje zrozumiały komunikat o braku obsługi w MVP.

---

## Phase 3: Historia dokumentów i bezpieczne pobranie

### Overview

Udostępnić w panelu upload, status oraz listę zanonimizowanych dokumentów należących do bieżącej kancelarii.

### Changes Required:

#### 1. Chronione API historii i pobrania

**Files**: `backend/app/main.py`, repozytorium dokumentów, testy API

**Intent**: Umożliwić listowanie własnych dokumentów i pobranie tylko ich zanonimizowanego wyniku po ponownej kontroli kancelarii.

**Contract**: `GET /documents` zwraca metadane dokumentów wyłącznie dla kancelarii z `AccessContext`. `GET /documents/{document_id}/anonymized-download` odrzuca cudzy lub niegotowy dokument bez ujawniania klucza S3 i generuje krótki link dopiero dla własnego gotowego wyniku. Oryginał i mapowanie nie są endpointami S-01.

#### 2. Panel uploadu i historii

**Files**: `frontend/src/App.jsx`, `frontend/src/api.js`, nowe testy kontraktu klienta

**Intent**: Zastąpić przycisk testu dostępu formularzem uploadu pojedynczego pliku, czytelnymi stanami walidacji i historią wyników kancelarii.

**Contract**: Klient wysyła `FormData` wraz z istniejącym Bearer tokenem, nie dodaje `office_id` i blokuje lokalnie pliki inne niż PDF/DOCX oraz ponad 10 MB. Lista odświeża się po udanym przetworzeniu, pokazuje nazwę/format/status i daje pobranie wyłącznie wyniku.

### Success Criteria:

#### Automated Verification:

- Testy API dowodzą, że druga kancelaria nie może listować ani pobrać wyniku dokumentu pierwszej kancelarii.
- Testy klienta dowodzą wysłania multipart z tokenem, lokalnej walidacji 10 MB oraz komunikatów 401/403/błędu przetwarzania.
- `npm run test`, `npm run lint` i `npm run build` przechodzą bez błędów.

#### Manual Verification:

- Prawnik widzi wyłącznie własne wyniki po odświeżeniu panelu i może pobrać zanonimizowaną wersję.
- Druga testowa kancelaria nie widzi ani nie pobiera wyniku pierwszej kancelarii.

---

## Phase 4: Regresje, granice danych i dokumentacja S3

### Overview

Zamknąć S-01 powtarzalnymi testami prywatności i dokumentacją konfiguracji, aby kolejne S-02/S-03/S-04 korzystały z jednego kontraktu danych.

### Changes Required:

#### 1. Pełny zestaw regresji dokumentów

**Files**: `backend/tests/`, `frontend/src/*.test.js`, konfiguracja testowa

**Intent**: Połączyć testy własności dokumentu, formatów, limitów, statusów i storage w powtarzalną bramkę lokalną/testową.

**Contract**: Testy używają tylko `_test` PostgreSQL, sztucznego S3 i kontrolowanego dostawcy Auth. Żaden test nie wymaga realnego AWS, Supabase ani Fly i żaden przypadek nie pozwala klientowi wybrać kancelarii lub odczytać oryginału/mapowania.

#### 2. Dokumentacja konfiguracji i granic S-01

**Files**: `README.md`, `docs/environment.md`, `context/changes/document-anonymization-flow/` artefakty planu

**Intent**: Opisać konfigurację S3, klucz szyfrowania, lokalny fake storage/testy oraz granice między S-01, S-02, S-03 i S-04.

**Contract**: Dokumentacja wymienia nazwy wymaganych sekretów bez wartości, wyjaśnia zachowanie oryginału/wyniku/mapowania oraz jasno oznacza OCR, batch upload, rozszerzenie Chrome i odwracanie znaczników jako poza zakresem S-01.

### Success Criteria:

#### Automated Verification:

- Pełny zestaw backendu przechodzi na lokalnej/testowej PostgreSQL z fałszywym S3 i bez połączenia z zewnętrznymi usługami.
- Pełny zestaw panelu, lint i build przechodzą bez błędów.
- Kontrola repozytorium potwierdza, że konfiguracja nie zawiera poświadczeń S3 ani klucza szyfrowania.

#### Manual Verification:

- Dwa konta testowe widzą odrębne historie i mogą pobrać tylko własne wyniki zanonimizowane.
- Dokumentacja pozwala nowej osobie skonfigurować S3 i uruchomić testy bez odczytywania wcześniejszej rozmowy.

## Testing Strategy

### Unit Tests:

- Detekcja i walidacja PESEL, NIP, e-maila, telefonu i IBAN oraz numeracja znaczników per dokument.
- Szyfrowanie/odszyfrowanie mapowania bez ekspozycji plaintext w odpowiedzi API.
- Walidacja typu, rozmiaru i pojedynczego pliku oraz adapter S3 z fałszywą implementacją.

### Integration Tests:

- Chroniony multipart upload, rekord dokumentu i wynik S3 dla właściwej kancelarii.
- Izolacja listy i pobrania między kancelariami, także gdy klient zgaduje identyfikator dokumentu.
- PDF z warstwą tekstową, DOCX z tabelą/nagłówkiem/stopką oraz kontrolowana odmowa skanowanego PDF.

### Manual Testing Steps:

1. Skonfiguruj testowy bucket S3 oraz nazwy sekretów tylko lokalnie/Fly, bez zapisywania wartości w repozytorium.
2. Zaloguj się jako kancelaria A, prześlij syntetyczny PDF i DOCX zawierające pięć klas danych, pobierz wyniki i sprawdź znaczniki.
3. Odśwież panel, sprawdź historię, a następnie zaloguj się jako kancelaria B i potwierdź brak dostępu do dokumentów A.
4. Prześlij skanowany PDF bez warstwy tekstowej oraz plik ponad 10 MB i potwierdź czytelne błędy bez ujawniania treści.

## Performance Considerations

S-01 przetwarza pojedynczy plik do 10 MB synchronicznie. Rozmiar oraz brak batch uploadu ograniczają czas odpowiedzi i pamięć pojedynczej maszyny Fly; większe dokumenty lub kolejki są osobną zmianą po zmierzeniu pilotażu.

## Migration Notes

Migracja dodaje tylko metadane dokumentów i zaszyfrowane mapowanie do PostgreSQL na Fly. Oryginał i wynik żyją w S3, a istniejące profile/kancelarie pozostają bez zmian. Przed zastosowaniem na Fly migracja i pełne testy muszą przejść na lokalnej/testowej PostgreSQL.

## References

- `context/foundation/roadmap.md:93-104`
- `context/foundation/prd.md:25-28`
- `context/archive/2026-10-02-minimal-document-access/plan.md:34-40`
- `backend/app/main.py:27-36`
- `backend/app/auth.py:61-83`
- `backend/app/models.py:15-41`
- `backend/tests/conftest.py:21-57`
- `backend/tests/test_access_isolation.py:13-46`
- `frontend/src/App.jsx:108-152`
- `frontend/src/api.js:9-44`
- `context/deployment/deploy-plan.md:31`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Dane dokumentu i granica storage

#### Automated

- [x] 1.1 Migracja dokumentów przechodzi na lokalnej/testowej PostgreSQL i tworzy ograniczenia własności kancelarii — 2d453b4
- [x] 1.2 Konfiguracja odrzuca brak S3 i klucza szyfrowania bez ujawniania wartości — 2d453b4
- [x] 1.3 Test adaptera storage używa fałszywej implementacji i klucza obiektu z kancelarią — 2d453b4

#### Manual

- [x] 1.4 Przykładowa konfiguracja rozdziela wartości publiczne od sekretów S3 i szyfrowania — 2d453b4

### Phase 2: Chroniony upload i silnik anonimizacji

#### Automated

- [x] 2.1 Testy API pokrywają 401, walidację uploadu i sukces z kontrolowanym AccessContext — 42e1cee
- [x] 2.2 Testy jednostkowe pokrywają pięć klas danych, powtórzenia i numerację per dokument — 42e1cee
- [x] 2.3 Testy PDF/DOCX zachowują format oraz usuwają wykryte dane z wyniku — 42e1cee
- [x] 2.4 Testy integracyjne używają fałszywego S3 bez połączenia z AWS — 42e1cee

#### Manual

- [x] 2.5 Zalogowany użytkownik anonimizuje syntetyczny PDF i DOCX do 10 MB — 42e1cee
- [x] 2.6 Skanowany PDF bez warstwy tekstowej ma czytelny błąd bez OCR — 42e1cee

### Phase 3: Historia dokumentów i bezpieczne pobranie

#### Automated

- [x] 3.1 Testy API blokują listę i pobranie wyniku przez drugą kancelarię
- [x] 3.2 Testy klienta pokrywają multipart z tokenem, limit 10 MB i komunikaty błędów
- [x] 3.3 npm run test, npm run lint i npm run build przechodzą bez błędów

#### Manual

- [x] 3.4 Panel pokazuje tylko własne wyniki po odświeżeniu i pobiera wersję zanonimizowaną
- [x] 3.5 Druga kancelaria nie widzi ani nie pobiera wyniku pierwszej kancelarii

### Phase 4: Regresje, granice danych i dokumentacja S3

#### Automated

- [ ] 4.1 Pełny backend przechodzi na `_test` PostgreSQL z fałszywym S3 i bez usług zewnętrznych
- [ ] 4.2 Pełny zestaw panelu, lint i build przechodzą bez błędów
- [ ] 4.3 Kontrola repozytorium potwierdza brak poświadczeń S3 i klucza szyfrowania

#### Manual

- [ ] 4.4 Dwa konta testowe widzą odrębne historie i pobierają tylko własne wyniki
- [ ] 4.5 Dokumentacja pozwala skonfigurować S3 i uruchomić testy bez wcześniejszej rozmowy
