# Zabezpiecz trasy produktu dla F-01 — plan implementacji

## Overview

Wprowadzić minimalną, serwerowo egzekwowaną granicę dostępu dla kancelarii: Supabase Auth uwierzytelnia użytkownika, a PostgreSQL na Fly.io przechowuje profile i kancelarie. Pierwsze uwierzytelnione użycie atomowo tworzy jedną kancelarię w bazie Fly, a trasy produktu wymagają ważnej tożsamości oraz kontekstu tej kancelarii. Zmiana realizuje F-01 i odblokowuje S-01 oraz S-03, nie implementując jeszcze anonimizacji, przechowywania dokumentów ani reguł.

## Current State Analysis

Backend ma tylko globalny CORS oraz publiczne `/health` i stub `/anonymize`; nie ma tożsamości, kontekstu kancelarii ani obsługi 401/403. Panel anonimowo pobiera Swagger UI pod `/docs` i błędnie próbuje sparsować HTML jako JSON, a rozszerzenie wysyła anonimowe żądania do `/anonymize`. Repo nie ma bazy, migracji, mechanizmu auth ani testów API.

## Desired End State

Użytkownik może zarejestrować konto przez panel i zalogować się e-mailem oraz hasłem. Pierwszy zweryfikowany token uruchamia idempotentne utworzenie profilu i jednej kancelarii w PostgreSQL na Fly; backend pobiera kancelarię wyłącznie z tej relacji, nie z danych przesłanych przez klienta.

`/health` pozostaje publiczne. Każda trasa produktu — w tym `/anonymize` — wymaga tokenu dostępu; bez tokenu zwraca 401, a niezgodna tożsamość lub kancelaria 403. Panel obsługuje logowanie, odtworzenie sesji i wylogowanie. Rozszerzenie Chrome pozostaje poza zakresem tej zmiany i nie uzyskuje jeszcze logowania.

### Key Discoveries:

- `backend/app/main.py:6-21` udostępnia CORS dla każdego originu oraz publiczny `/anonymize` bez wejścia i bez kontroli tożsamości.
- `frontend/src/App.jsx:11-15` i `chrome-extension/background.js:34-38` wywołują backend bez poświadczeń; oba klienty potrzebują wspólnego, serwerowego kontraktu 401/403.
- `context/foundation/roadmap.md:78-89` definiuje F-01 jako granicę między danymi kancelarii oraz wskazuje, że odblokowuje S-01 i S-03.
- `context/foundation/tech-stack.md:15,24` deklaruje auth, a `context/deployment/deploy-plan.md:27-28` opisuje PostgreSQL na Fly jako bazę aplikacji; repo nie zawiera jeszcze zależności auth, sterownika PostgreSQL, ORM ani migracji.
- `frontend/package.json:6-22` zapewnia build i lint, ale repo nie ma testów backendu ani klienta.
- `.github/workflows/fly-panel.yml:1-15` wdraża panel na Fly, podczas gdy `frontend/wrangler.toml:8-10` jest jedynym miejscem konfigurującym `VITE_API_BASE`; `frontend/Dockerfile:1-4` kopiuje gotowy `dist` bez budowania źródeł.

## What We're NOT Doing

- Przechowywanie, pobieranie lub anonimizację dokumentów; to należy do S-01.
- CRUD reguł i słowników kancelarii; to należy do S-03.
- Logowanie, transfer plików lub zmiany UX rozszerzenia Chrome; to należy do S-02.
- Wiele kancelarii na konto, zaproszenia, role zespołowe, ręczne zatwierdzanie rejestracji i administrację użytkownikami.
- Migrację infrastruktury wdrożeniowej ani wdrożenie nowych sekretów na środowisko produkcyjne.

## Implementation Approach

Użyć Supabase Auth wyłącznie jako dostawcy tożsamości, a minimalną relację konto → kancelaria przechowywać w PostgreSQL na Fly. Backend weryfikuje token dostępu na każdej trasie produktu, po czym idempotentnie pobiera lub tworzy profil i kancelarię w swojej bazie; klient nie wybiera kancelarii samodzielnie. Panel używa sesji Supabase do rejestracji, logowania i wylogowania, a jego wywołania API dołączają token. CORS przechodzi z wildcarda do konfigurowanej listy originów panelu; publiczne pozostaje tylko health check. Dla F-01 kanonicznym sposobem dostarczania panelu jest istniejący deploy Fly: build panelu musi otrzymać wyłącznie publiczne `VITE_*` podczas budowania artefaktu i nie może zależeć od niewykorzystywanej konfiguracji Wrangler.

## Critical Implementation Details

Utworzenie kancelarii musi nastąpić atomowo po stronie backendu po zweryfikowaniu tokenu Supabase, aby klient nie mógł podmienić właściciela ani `office_id`. Kolejne slice’y mogą korzystać wyłącznie z kancelarii wyprowadzonej z relacji w PostgreSQL na Fly, nigdy z pola requestu.

## Phase 1: Tożsamość i kancelaria

### Overview

Ustanowić konfigurację dostawcy tożsamości oraz minimalny model danych jednej kancelarii przypisanej do konta.

### Changes Required:

#### 1. Konfiguracja Supabase i zależności aplikacji

**Files**: `backend/requirements.txt`, `pyproject.toml`, `frontend/package.json`, `frontend/Dockerfile`, `frontend/fly.toml`, `.github/workflows/fly-panel.yml`, nowy moduł konfiguracji backendu, moduł bazy danych, konfiguracja migracji oraz przykładowa konfiguracja środowiska

**Intent**: Dodać obsługiwane zależności klienta/weryfikacji Supabase, PostgreSQL i migracji oraz jedno źródło konfiguracji wymaganych kluczy, URL-i i `DATABASE_URL`. Konfiguracja musi fail-fast przy uruchomieniu chronionych tras bez wymaganych wartości.

**Contract**: Backend rozróżnia publiczną konfigurację klienta od serwerowych poświadczeń i `DATABASE_URL`; sekrety nie trafiają do bundla frontendu ani repozytorium. Panel otrzymuje wyłącznie publiczny URL i klucz wymagane przez klienta Auth, przekazane jako `VITE_*` podczas builda bieżącego artefaktu Fly. Kontener panelu buduje źródła w wieloetapowym obrazie, zamiast kopiować nieśledzony `dist`; pipeline Fly przekazuje wyłącznie wartości publiczne i nie korzysta z Wrangler jako źródła konfiguracji. Migracje są uruchamiane przez narzędzie migracyjne backendu przeciwko lokalnej lub testowej instancji PostgreSQL, nigdy przez klienta ani przez produkcyjną bazę Fly podczas testów.

#### 2. Minimalny model kancelarii i automatyczne utworzenie przy rejestracji

**Files**: nowe modele i repozytorium backendu, katalog migracji PostgreSQL oraz nowa dokumentacja konfiguracji środowiska

**Intent**: Utworzyć w PostgreSQL na Fly minimalne encje kancelarii i profilu użytkownika oraz automatycznie wiązać zweryfikowane konto z jedną kancelarią. Przyszłe dane dokumentów i reguł będą używały tej relacji jako jedynego źródła własności.

**Contract**: Każde konto ma dokładnie jeden profil i jedną kancelarię utworzoną przy pierwszym zweryfikowanym użyciu. Unikalny identyfikator użytkownika z tokenu Supabase jest kluczem powiązania; transakcja backendu tworzy relację tylko raz i żadna wartość klienta nie może przypisać konta do cudzej kancelarii.

### Success Criteria:

#### Automated Verification:

- Narzędzie migracyjne backendu uruchamia migracje przeciwko lokalnej lub testowej PostgreSQL, obejmującą kancelarię, profil oraz unikalne powiązanie użytkownika z kancelarią.
- Konfiguracja backendu odrzuca brak wymaganych wartości auth z komunikatem bez ujawniania sekretów.
- Build panelu oraz lint kończą się powodzeniem po dodaniu klienta Auth.
- Build obrazu panelu dla bieżącego deployu Fly kończy się powodzeniem z publicznymi wartościami `VITE_*` i bez wpisywania sekretów do obrazu.

#### Manual Verification:

- Nowa rejestracja, a następnie pierwsze uwierzytelnione wywołanie backendu, tworzy jedno konto, profil i kancelarię bez ręcznej administracji.
- Próba użycia przez inne konto kontekstu cudzej kancelarii nie zmienia ani nie zwraca cudzych danych.

---

## Phase 2: Serwerowa ochrona tras

### Overview

Utworzyć backendową zależność tożsamości i kancelarii, a następnie zastosować ją do tras produktu oraz zawęzić CORS.

### Changes Required:

#### 1. Weryfikacja tokenu i kontekst kancelarii

**Files**: `backend/app/main.py`, nowe moduły auth i zależności backendu

**Intent**: Weryfikować token dostępu przy każdej trasie produktu oraz pobierać bieżącą kancelarię z relacji w PostgreSQL na Fly. Handlerom należy przekazywać zaufany kontekst użytkownika i kancelarii, gotowy dla S-01 i S-03.

**Contract**: Brakujący lub nieważny token zwraca 401; niepowodzenie utworzenia albo odczytu kontekstu profilu i kancelarii w PostgreSQL zwraca 403. API nie przyjmuje `office_id` jako podstawy autoryzacji. `/health` nie używa zależności auth.

#### 2. Polityka tras i originów

**Files**: `backend/app/main.py`, moduł konfiguracji backendu, dokumentacja środowiska

**Intent**: Zastąpić CORS z wildcarda konfigurowaną listą originów panelu, usunąć błędne panelowe wywołanie `/docs` oraz ograniczyć powierzchnię dokumentacji API poza środowiskiem lokalnym.

**Contract**: Produkcyjne trasy produktu są chronione domyślnie; nowa trasa produktu musi jawnie używać zależności aktualnego użytkownika/kancelarii. Originy są skonfigurowane poza kodem, a odpowiedzi 401/403 są stabilne dla panelu i przyszłego rozszerzenia. `/health` pozostaje publiczne; `/docs`, `/redoc` i `/openapi.json` są dostępne tylko lokalnie i wyłączone w produkcji.

#### 3. Kontrakt istniejącego `/anonymize`

**Files**: `backend/app/main.py`, testy API

**Intent**: Zachować istniejący stub jako chronioną trasę, aby F-01 nie udawał ukończonej anonimizacji, ale sprawdzał granicę dostępu już teraz.

**Contract**: `/anonymize` wymaga kontekstu auth i zwraca obecny odpowiednik stubu tylko po udanej weryfikacji; nie dodaje jeszcze uploadu, przetwarzania plików ani trwałego dokumentu.

### Success Criteria:

#### Automated Verification:

- Testy API potwierdzają, że `/health` jest publiczne, a `/anonymize` zwraca 401 bez tokenu.
- Testy API potwierdzają 403 dla uwierzytelnionej tożsamości bez dozwolonego kontekstu kancelarii w PostgreSQL oraz sukces dla poprawnego kontekstu.
- Testy konfiguracji potwierdzają, że wildcard CORS nie jest używany w środowisku produkcyjnym.
- Testy konfiguracji potwierdzają, że produkcja wyłącza `/docs`, `/redoc` i `/openapi.json`, a środowisko lokalne je udostępnia.

#### Manual Verification:

- Wywołanie `/anonymize` bez sesji z panelu lub narzędzia HTTP otrzymuje czytelny brak dostępu, bez wyniku stubu.
- Health check pozostaje dostępny bez konta.

---

## Phase 3: Panel logowania i sesja

### Overview

Dodać panelowy przepływ rejestracji i logowania oraz połączyć go z chronionym API, bez rozszerzania zakresu o anonimizację.

### Changes Required:

#### 1. Klient Auth i stan sesji panelu

**Files**: `frontend/src/App.jsx`, nowe moduły auth/API panelu, pliki konfiguracji panelu

**Intent**: Zastąpić demonstracyjny stan panelu przepływami rejestracji, logowania, przywrócenia sesji i wylogowania. Panel powinien rozróżniać ekran publiczny od chronionej powierzchni produktu.

**Contract**: Rejestracja używa e-maila i hasła; sukces przeprowadza użytkownika do chronionej powierzchni. Stan sesji jest odtwarzany przy odświeżeniu, a wylogowanie usuwa dostęp do chronionych wywołań.

#### 2. Uwierzytelnione wywołania API i komunikaty dostępu

**Files**: `frontend/src/App.jsx`, nowy moduł klienta API panelu

**Intent**: Centralnie dołączać token sesji do wywołań tras produktu i obsłużyć 401/403 w sposób zrozumiały dla użytkownika.

**Contract**: Żadne wywołanie trasy produktu z panelu nie używa anonimowego `fetch`. 401 kieruje do ponownego logowania; 403 przedstawia komunikat o braku dostępu bez ujawniania danych innej kancelarii.

### Success Criteria:

#### Automated Verification:

- `npm run lint` kończy się bez błędów.
- `npm run build` kończy się powodzeniem z publiczną konfiguracją Auth.
- Testy komponentu lub kontraktu klienta pokrywają brak sesji, sesję odtworzoną i odpowiedzi 401/403.

#### Manual Verification:

- Użytkownik może zarejestrować konto, zalogować się, odświeżyć panel i pozostać zalogowany.
- Po wylogowaniu panel nie pokazuje chronionej powierzchni ani nie wysyła tokenu do API.
- Panel przedstawia czytelny komunikat przy 401 i 403.

---

## Phase 4: Weryfikacja granicy dostępu

### Overview

Zabezpieczyć regresję na poziomie API i panelu oraz udokumentować konfigurację potrzebną do lokalnego i wdrożonego uruchomienia.

### Changes Required:

#### 1. Zestaw testów auth i izolacji

**Files**: nowy katalog testów backendu, testy panelu, konfiguracja testowa i zależności developerskie

**Intent**: Dodać powtarzalne testy granicy bezpieczeństwa zamiast polegać wyłącznie na ręcznym sprawdzaniu nowego loginu.

**Contract**: Testy izolują integrację z dostawcą Auth przez kontrolowane tokeny/mocks i uruchamiają migracje na testowej PostgreSQL. Weryfikują publiczny health check, 401, 403, poprawny kontekst kancelarii oraz brak zaufania do identyfikatora kancelarii przesłanego przez klienta.

#### 2. Dokumentacja uruchomienia i ograniczeń F-01

**Files**: dokumentacja projektu oraz `context/changes/minimal-document-access/` artefakty planowania

**Intent**: Zapisać wymagane zmienne środowiskowe, kolejność migracji i granice F-01, aby S-01 i S-03 budowały na tym samym kontrakcie.

**Contract**: Dokumentacja rozdziela wartości publiczne od sekretów, nie zapisuje sekretów w repozytorium i wyraźnie wskazuje, że rozszerzenie Chrome oraz przechowywanie dokumentów nie należą do F-01.

### Success Criteria:

#### Automated Verification:

- Zestaw testów backendu przechodzi lokalnie bez połączenia z produkcyjnym projektem Auth.
- Build i lint panelu przechodzą razem z testami kontraktów dostępu.
- Kontrola repozytorium potwierdza, że pliki konfiguracyjne nie zawierają kluczy serwerowych.

#### Manual Verification:

- Dwa świeżo zarejestrowane konta nie mogą uzyskać dostępu do kontekstu drugiej kancelarii.
- Przyszły implementer S-01 może wskazać jeden zaufany kontekst kancelarii bez dodawania nowego mechanizmu auth.

## Testing Strategy

### Unit Tests:

- Walidacja konfiguracji auth i zestawu dozwolonych originów.
- Weryfikacja zależności aktualnego użytkownika/kancelarii dla braku tokenu, nieważnego tokenu i niepełnego profilu.
- Mapowanie statusów 401/403 na stany panelu.

### Integration Tests:

- Publiczny `/health` i chroniony `/anonymize`.
- Rejestracja tworząca dokładnie jedną kancelarię oraz brak możliwości podstawienia cudzej kancelarii.
- Odtworzenie i wylogowanie sesji panelu przed uwierzytelnionym wywołaniem API.

### Manual Testing Steps:

1. Uruchom lokalną lub testową PostgreSQL dla migracji oraz skonfiguruj lokalne wartości Supabase Auth i `DATABASE_URL` bez dodawania sekretów do repozytorium.
2. Zarejestruj dwa konta, wywołaj backend z każdym tokenem i potwierdź, że każde ma własną kancelarię w PostgreSQL na Fly.
3. Wywołaj `/health` bez tokenu, a następnie `/anonymize` bez tokenu i z tokenem obu kont.
4. Zaloguj się i wyloguj w panelu, odśwież stronę oraz sprawdź komunikaty 401/403.

## Performance Considerations

Weryfikacja tokenu i pobranie kontekstu kancelarii dodają pracę do każdej trasy produktu. Na etapie pilotażu preferowana jest poprawna, jednoznaczna kontrola dostępu; dopiero pomiar po S-01 może uzasadnić cache kontekstu.

## Migration Notes

Migracja wprowadza nowe tabele w PostgreSQL na Fly, bez istniejących danych aplikacyjnych do przeniesienia. Należy uruchomić ją najpierw przeciwko lokalnej lub testowej PostgreSQL, a następnie przez kontrolowany proces wdrożeniowy przeciwko bazie Fly; wyłączenie konfiguracji klienta nie kasuje kont ani kancelarii.

## References

- `context/changes/minimal-document-access/change.md`
- `context/foundation/roadmap.md:78-89`
- `context/foundation/prd.md:14, 26-28, 34`
- `context/foundation/tech-stack.md:15, 24`
- `backend/app/main.py:6-21`
- `frontend/src/App.jsx:4, 11-16, 29-32`
- `chrome-extension/background.js:32-51`
- `chrome-extension/popup.js:16-37`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Tożsamość i kancelaria

#### Automated

- [x] 1.1 Narzędzie migracyjne backendu uruchamia migracje przeciwko lokalnej lub testowej PostgreSQL, obejmującą kancelarię, profil oraz unikalne powiązanie użytkownika z kancelarią
- [x] 1.2 Konfiguracja backendu odrzuca brak wymaganych wartości auth z komunikatem bez ujawniania sekretów
- [x] 1.3 Build panelu oraz lint kończą się powodzeniem po dodaniu klienta Auth
- [x] 1.6 Build obrazu panelu dla bieżącego deployu Fly kończy się powodzeniem z publicznymi wartościami `VITE_*` i bez wpisywania sekretów do obrazu

#### Manual

- [ ] 1.4 Nowa rejestracja, a następnie pierwsze uwierzytelnione wywołanie backendu, tworzy jedno konto, profil i kancelarię bez ręcznej administracji
- [ ] 1.5 Próba użycia przez inne konto kontekstu cudzej kancelarii nie zmienia ani nie zwraca cudzych danych

### Phase 2: Serwerowa ochrona tras

#### Automated

- [x] 2.1 Testy API potwierdzają, że `/health` jest publiczne, a `/anonymize` zwraca 401 bez tokenu
- [x] 2.2 Testy API potwierdzają 403 dla uwierzytelnionej tożsamości bez dozwolonego kontekstu kancelarii w PostgreSQL oraz sukces dla poprawnego kontekstu
- [x] 2.3 Testy konfiguracji potwierdzają, że wildcard CORS nie jest używany w środowisku produkcyjnym
- [x] 2.6 Testy konfiguracji potwierdzają, że produkcja wyłącza `/docs`, `/redoc` i `/openapi.json`, a środowisko lokalne je udostępnia

#### Manual

- [ ] 2.4 Wywołanie `/anonymize` bez sesji otrzymuje czytelny brak dostępu, bez wyniku stubu
- [ ] 2.5 Health check pozostaje dostępny bez konta

### Phase 3: Panel logowania i sesja

#### Automated

- [ ] 3.1 `npm run lint` kończy się bez błędów
- [ ] 3.2 `npm run build` kończy się powodzeniem z publiczną konfiguracją Auth
- [ ] 3.3 Testy komponentu lub kontraktu klienta pokrywają brak sesji, sesję odtworzoną i odpowiedzi 401/403

#### Manual

- [ ] 3.4 Użytkownik może zarejestrować konto, zalogować się, odświeżyć panel i pozostać zalogowany
- [ ] 3.5 Po wylogowaniu panel nie pokazuje chronionej powierzchni ani nie wysyła tokenu do API
- [ ] 3.6 Panel przedstawia czytelny komunikat przy 401 i 403

### Phase 4: Weryfikacja granicy dostępu

#### Automated

- [ ] 4.1 Zestaw testów backendu przechodzi lokalnie bez połączenia z produkcyjnym projektem Auth
- [ ] 4.2 Build i lint panelu przechodzą razem z testami kontraktów dostępu
- [ ] 4.3 Kontrola repozytorium potwierdza, że pliki konfiguracyjne nie zawierają kluczy serwerowych

#### Manual

- [ ] 4.4 Dwa świeżo zarejestrowane konta nie mogą uzyskać dostępu do kontekstu drugiej kancelarii
- [ ] 4.5 Przyszły implementer S-01 może wskazać jeden zaufany kontekst kancelarii bez dodawania nowego mechanizmu auth
