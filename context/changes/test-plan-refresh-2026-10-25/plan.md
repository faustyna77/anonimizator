# Kontrakt publicznej konfiguracji panelu — plan implementacji

## Overview

Panel kancelarii ma odrzucać wadliwą konfigurację publiczną zanim rozpocznie logowanie lub żądanie produktu. Ten plan usuwa niejawny fallback API, ustanawia jeden testowalny kontrakt dla trzech wartości Vite i zatrzymuje wadliwy release przed `flyctl deploy`.

## Current State Analysis

Trzy publiczne wartości są przekazywane z GitHub Variables do Docker builda i wbudowywane w statyczny bundle Vite (`.github/workflows/fly-panel.yml:13-23`, `frontend/Dockerfile:9-20`). Brak wartości Supabase jest wykrywany dopiero przy inicjalizacji auth, a `VITE_API_BASE` ma fallback do produkcyjnego hosta (`frontend/src/auth.js:3-16`, `frontend/src/App.jsx:22,102-137`).

Frontend ma działający Vitest (`frontend/package.json:6-25`); bieżąca bramka przeszła: 39 testów. Nie ma jeszcze testu ani workflow preflightu dla kontraktu publicznej konfiguracji.

## Desired End State

Każdy build panelu używa jednego resolvera dla `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` i `VITE_API_BASE`. Resolver przyjmuje tylko kompletne konfiguracje z HTTPS albo HTTP na loopback, a w innych przypadkach zwraca kontrolowany błąd bez ujawnienia wartości.

Wydanie z pustą lub syntaktycznie niedozwoloną wartością zatrzymuje się w GitHub Actions przed budową i wdrożeniem. Prawidłowa konfiguracja zdalna oraz jawnie lokalna konfiguracja loopback przechodzą kontrakt i testy bez E2E.

### Key Discoveries:

- `.github/workflows/fly-panel.yml:13-23` przekazuje trzy wartości jako Docker build arguments, ale nie sprawdza ich przed deployem.
- `frontend/Dockerfile:9-20` tworzy statyczny bundle; runtime nginx nie ma punktu na późniejsze uzupełnienie konfiguracji.
- `frontend/src/auth.js:3-16` i `frontend/src/App.jsx:22,185-190` używają dziś rozdzielonych ścieżek konfiguracji.
- `frontend/src/api.test.js:6-17` pokazuje konwencję Vitest z wstrzykniętymi zależnościami; test czystego resolvera nie potrzebuje DOM ani sieci.

## What We're NOT Doing

- Nie dodajemy testu E2E, browser smoke ani kontaktu z prawdziwym Supabase/Fly.
- Nie sprawdzamy dostępności, DNS, certyfikatu ani zgodności biznesowej zdalnych hostów; kontrakt chroni wyłącznie obecność i bezpieczny format publicznych wartości.
- Nie zapisujemy GitHub Variables, kluczy, tokenów ani plików `.env` w repozytorium.
- Nie zmieniamy backendu, modelu sesji ani konfiguracji Chrome extension.

## Implementation Approach

Wydzielić mały, czysty resolver przyjmujący jawny obiekt środowiska. Auth i klient produktu korzystają wyłącznie z jego wyniku, dlatego brak `VITE_API_BASE` nie może przejść przez fallback. Resolver będzie jedynym miejscem walidacji: URL ma być HTTPS albo `http` na `localhost`, `127.0.0.1` lub `[::1]`, a wszystkie trzy wartości po trimie muszą być niepuste.

Ten sam resolver będzie uruchamiany z procesu Node w workflow deploymentu. Faza release’u doda dostępny w GitHub Actions setup Node oraz `npm ci`, po czym wykona preflight przed `flyctl deploy`; nie tworzy nowej infrastruktury testowej ani usług CI.

## Critical Implementation Details

Walidator musi przyjmować środowisko jako argument, zamiast czytać `import.meta.env` wewnątrz logiki kontraktu. Dzięki temu Vitest i skrypt Node używają identycznej semantyki bez emulowania Vite. Komunikaty błędów mogą nazwać brakującą zmienną, ale nigdy nie mogą zawierać jej wartości.

## Phase 1: Kontrakt konfiguracji panelu

### Overview

Utworzyć jeden testowalny kontrakt dla publicznych wartości panelu i podłączyć go do inicjalizacji auth oraz wyboru API. Chroni to prawnika przed pozornie działającym panelem, który nie może bezpiecznie rozpocząć podstawowego przepływu.

### Changes Required:

#### 1. Resolver publicznej konfiguracji

**Files**: `frontend/src/public-config.js` (new), `frontend/src/public-config.test.js` (new)

**Intent**: Zdefiniować czysty punkt wejścia, który rozstrzyga, czy konfiguracja panelu jest używalna, zanim auth albo klient produktu utworzą żądanie. Testy opisują scenariusz biznesowy, nie szczegóły bieżącego fallbacku.

**Contract**: Resolver przyjmuje obiekt środowiska i zwraca kompletne `supabaseUrl`, `supabaseAnonKey` oraz `apiBase`, albo rzuca kontrolowany błąd konfiguracji. Wszystkie trzy wartości są wymagane po trimie; oba URL-e muszą być poprawne, używać HTTPS albo HTTP tylko na `localhost`, `127.0.0.1` lub `[::1]`; błąd nie zawiera wartości konfiguracji. API base jest zwracany w formie bez końcowego ukośnika, aby jego łączenie ze ścieżkami produktu było deterministyczne.

#### 2. Konsumenci konfiguracji panelu

**Files**: `frontend/src/auth.js`, `frontend/src/App.jsx`

**Intent**: Usunąć rozbieżne odczyty `import.meta.env`, aby login i każde żądanie produktu zależały od tego samego zaakceptowanego kontraktu. Pozostawić istniejący bezpieczny mechanizm widocznego błędu auth zamiast tworzyć nowy ekran lub ukryty fallback.

**Contract**: `createSupabaseAuthClient` oraz konstrukcja `createProductApi` otrzymują dane wyłącznie z resolvera; `VITE_API_BASE` nie ma wartości domyślnej. Przy wadliwej konfiguracji aplikacja nie tworzy klienta auth ani klienta produktu, a widoczny komunikat pozostaje ogólny i nie ujawnia wartości zmiennych.

### Success Criteria:

#### Automated Verification:

- Deterministyczne testy Vitest obejmują poprawną konfigurację HTTPS, poprawną konfigurację HTTP loopback, brak każdej z trzech wartości, niepoprawny URL i HTTP na nie-loopback: `cd frontend && npm test -- src/public-config.test.js`.
- Auth i konstrukcja klienta produktu korzystają z resolvera, a `VITE_API_BASE` nie ma fallbacku: `cd frontend && npm test`.
- Pełna bramka lint/build przechodzi: `cd frontend && npm run lint && npm run build`.

#### Manual Verification:

- Przy tymczasowej publicznej konfiguracji loopback uruchomiony lokalnie panel może rozpocząć inicjalizację auth, a przy celowo niekompletnej konfiguracji pokazuje bezpieczny błąd, nie aktywuje logowania i nie wykonuje żądania produktu.

**Implementation Note**: Po ukończeniu automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie powyższych zachowań przed Fazą 2.

---

## Phase 2: Bramka release’u konfiguracji

### Overview

Użyć tego samego kontraktu przed deploymentem Fly i uaktualnić instrukcję publicznych zmiennych. To zapobiega zbudowaniu oraz opublikowaniu obrazu, który zawiera pustą lub syntaktycznie niedozwoloną konfigurację.

### Changes Required:

#### 1. Wykonywalny preflight Node

**Files**: `frontend/scripts/validate-public-config.mjs` (new), `frontend/package.json`

**Intent**: Udostępnić workflow jednoznaczny, bezsieciowy command preflightu korzystający z resolvera z Fazy 1. Daje to prawdziwą bramkę release’u, a nie samą dokumentację czy skopiowaną walidację shellową.

**Contract**: Skrypt pobiera tylko trzy publiczne zmienne z `process.env`, kończy się statusem niezerowym dla konfiguracji odrzuconej przez resolver i nie wypisuje ich wartości. Nowy skrypt package jest wykonywalny lokalnie z syntetycznymi wartościami testowymi oraz w GitHub Actions.

#### 2. Wcześniejsze zatrzymanie workflow Fly

**Files**: `.github/workflows/fly-panel.yml`

**Intent**: Zapewnić Node i zależności wyłącznie dla obecnego joba deployu, a następnie uruchomić preflight przed `flyctl deploy`. To jest wymagana konfiguracja infrastruktury dla nowej bramki; nie wymaga nowego runnera, sekretu ani usługi CI.

**Contract**: Workflow kolejno checkoutuje kod, przygotowuje Node, instaluje zależności frontendu, waliduje trzy istniejące GitHub Variables i dopiero wtedy wywołuje `flyctl deploy`. Nie zmienia nazw źródeł wartości, nie loguje ich i nie przekazuje żadnych wartości prywatnych do frontendu.

#### 3. Dokumentacja granicy publicznej konfiguracji

**Files**: `docs/environment.md`

**Intent**: Zapisać wymagane trzy publiczne zmienne oraz politykę protokołu/loopback, aby lokalny dev i deployment używały tego samego kontraktu.

**Contract**: Sekcja panelu opisuje wymaganie wszystkich trzech wartości, HTTPS dla endpointów zdalnych, ograniczenie HTTP do loopback w local dev oraz komendę preflightu bez podawania wartości, kluczy ani przykładowych sekretów.

### Success Criteria:

#### Automated Verification:

- Preflight akceptuje syntetyczne wartości HTTPS oraz kończy się błędem dla pustej lub niedozwolonej wartości: `cd frontend && VITE_SUPABASE_URL=https://auth.example.test VITE_SUPABASE_ANON_KEY=public-test-key VITE_API_BASE=https://api.example.test npm run validate:public-config`.
- Pełna bramka frontendu nadal przechodzi: `cd frontend && npm test && npm run lint && npm run build`.
- Workflow zawiera wykonanie `npm run validate:public-config` przed jedynym wywołaniem `flyctl deploy`: `.github/workflows/fly-panel.yml`.

#### Manual Verification:

- W logu następnego prawdziwego deployu preflight kończy się przed buildem bez wypisywania publicznego klucza ani URL-i; przy celowo pustej zmiennej job zatrzymuje się przed Fly deployem.
- Dokumentacja pozwala odtworzyć lokalny preflight wyłącznie na publicznych, syntetycznych wartościach.

**Implementation Note**: Po ukończeniu automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie zachowania workflow przed zamknięciem fazy.

---

## Testing Strategy

### Unit Tests:

- Wstrzykiwać obiekt środowiska do resolvera; nie modyfikować globalnego `import.meta.env` ani nie tworzyć klienta Supabase.
- Obejmować kompletność trzech wartości, parsing URL, dozwolone HTTPS, dozwolony HTTP loopback oraz odrzucony HTTP na zdalnym hoście.
- Asercje błędów weryfikują stabilny typ/kod i nazwy zmiennych, nigdy wprowadzone wartości.

### Integration Tests:

- Nie są potrzebne: granica jest czystym kontraktem frontendu i skryptem Node bez sieci.

### Manual Testing Steps:

1. Uruchomić preflight na syntetycznej konfiguracji HTTPS i potwierdzić kod wyjścia 0.
2. Ustawić jedną wartość na pustą w jednorazowym poleceniu i potwierdzić kod niezerowy oraz brak wycieku wartości.
3. Sprawdzić w GitHub Actions, że preflight znajduje się przed Fly deployem i błędny release nie dochodzi do budowy obrazu.

## Performance Considerations

Resolver przetwarza trzy krótkie łańcuchy tylko przy inicjalizacji/config preflight; nie tworzy żądań ani nie wpływa na przetwarzanie dokumentów.

## Migration Notes

Brak migracji danych. Aktualne GitHub Variables zachowują swoje nazwy; tylko ich brak lub niedozwolony format zacznie świadomie blokować release.

## References

- Research: `context/changes/test-plan-refresh-2026-10-25/research.md`
- Vite/Fly injection: `.github/workflows/fly-panel.yml:13-23`, `frontend/Dockerfile:9-20`
- Current consumers: `frontend/src/auth.js:3-16`, `frontend/src/App.jsx:22,102-137,185-190`
- Test convention: `frontend/src/api.test.js:6-17`
- Environment boundary: `docs/environment.md:75-83`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Kontrakt konfiguracji panelu

#### Automated

- [x] 1.1 Testy kontraktu publicznej konfiguracji
- [x] 1.2 Wspólny resolver używany przez auth i API
- [x] 1.3 Pełna bramka lint/build frontendu

#### Manual

- [x] 1.4 Ręczna weryfikacja konfiguracji local dev i błędu fail-fast

### Phase 2: Bramka release’u konfiguracji

#### Automated

- [ ] 2.1 Skrypt preflightu publicznej konfiguracji
- [ ] 2.2 Workflow zatrzymuje deploy przed Fly
- [ ] 2.3 Pełna bramka frontendu po wiringu release’u

#### Manual

- [ ] 2.4 Ręczna weryfikacja kolejnego release’u i dokumentacji
- [ ] 2.5 Ręczne odtworzenie lokalnego preflightu na syntetycznych wartościach
