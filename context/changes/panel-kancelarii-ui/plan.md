# Panel Kancelarii UI — Plan implementacji

## Overview

Uporządkować istniejący zalogowany Panel Kancelarii bez zmiany backendu, kontraktów API ani przepływu danych wrażliwych. Zmiana ustanowi lokalny kontrakt tokenów i prymitywów UI, wyróżni anonimizację jako główną akcję, rozdzieli stany danych oraz zakończy się dev-only kitchen sinkiem i zweryfikowanymi zrzutami.

## Current State Analysis

`App` renderuje wszystkie cztery funkcje jako podobne karty w jednej gałęzi zalogowanej (`frontend/src/App.jsx:474-671`). Globalne zmienne CSS są w `frontend/src/index.css:1-51`, ale panel używa w swoich regułach bezpośrednio głównie `--border` (`frontend/src/App.css:211,251,262,302`). Nie ma katalogu importowalnych komponentów UI, a obecne odczyty dokumentów i reguł używają pustych tablic zarówno przed odpowiedzią, jak i przy pustym wyniku (`frontend/src/App.jsx:30-31,339-349,569-570,603-604`).

## Desired End State

Zalogowany użytkownik widzi najpierw wyraźny obszar anonimizacji, a niżej uporządkowane funkcje pomocnicze. Wszystkie kontrolki korzystają z lokalnych tokenów oraz `Button`, `Field` i `Card`; stany default, hover, focus-visible, disabled, error, empty i loading są nazwane oraz widoczne w dev-only kitchen sinku. Desktopowy i mobilny zrzut stanowią dowód wizualny, a `npm run lint` pilnuje braku literałów w oczyszczonym widoku.

### Key Discoveries:

- `frontend/package.json:13-25` nie deklaruje biblioteki komponentów ani narzędzia zrzutów; decyzją tej zmiany jest nie dodawać biblioteki UI ani testów E2E.
- `frontend/src/App.jsx:63-90,183-197,200-231,268-336,368-465` zawiera ochronę między sesjami kancelarii i przed spóźnionymi odpowiedziami; refaktoryzacja UI musi ją zachować.
- `frontend/src/App.jsx:501,507,663,717` dostarcza istniejące semantyki `status`/`alert`, które nie mogą zniknąć z markup.
- `playwright-cli` nie jest obecnie zainstalowany globalnie; wybrana bramka to jego jednorazowa instalacja i zrzuty, nie nowy runner E2E.

## What We're NOT Doing

- Nie zmieniamy endpointów, payloadów, autoryzacji Bearer, modelu danych ani backendu.
- Nie dodajemy biblioteki UI, routera, nowej produkcyjnej trasy ani pełnego Playwright E2E.
- Nie usuwamy ręcznego przepływu deanonymizacji, limitu 50 000 znaków ani zasad czyszczenia tekstu odpowiedzi.
- Nie wprowadzamy clipboarda, trwałego zapisu tekstu AI, uploadu wielu plików ani rebrandingu całego MVP.
- Nie aktualizujemy przyszłych baseline’ów screenshotów w ciemno; repo nie będzie w tej zmianie otrzymywało testu snapshotowego.

## Implementation Approach

Pierwsza faza dodaje lekki guard do istniejących narzędzi Node i przygotowuje powtarzalne lokalne użycie `playwright-cli`. Druga definiuje role semantyczne w jedynym istniejącym źródle tokenów. Trzecia buduje lokalne prymitywy oraz refaktoryzuje jeden widok do układu priorytetowego. Czwarta rozdziela resource state, dodaje dev-only kitchen sink i dowody wizualne, a następnie zostawia regułę, która zabezpiecza kontrakt dla kolejnych sesji.

## Critical Implementation Details

Kod, który zmienia `session`, `requestGenerationRef` lub dane zależne od kancelarii, musi zachować kolejność unieważnienia żądań i czyszczenia stanu z `frontend/src/App.jsx:47-90,183-197`. Kitchen sink nie może udostępniać danych syntetycznych w buildzie produkcyjnym: wejście ma być warunkowane `import.meta.env.DEV`, bez dodania routera ani endpointu.

## Faza 1: Środowisko i guard UI

### Overview

Ustanowić granicę lokalnego systemu UI bez nowej zależności oraz automatyczny skan literałów dla oczyszczanego widoku.

### Changes Required:

#### 1. Skrypt kontroli UI i skrypty npm

**Files**: `frontend/scripts/check-ui-literals.mjs` (new), `frontend/package.json`

**Intent**: Dodać przenośną, repozytoryjną kontrolę kandydatów na surowe wartości, aby istniejący linter nie pozwolił kolejnym zmianom wracać do kolorów, klas palety i arbitralnych wartości w Panelu Kancelarii.

**Contract**: Skrypt ma skanować `frontend/src/App.jsx`, `frontend/src/App.css` oraz lokalny katalog `frontend/src/components/ui/`, zwracać liczbę trafień i kończyć się kodem niezerowym dla nowych niedozwolonych trafień. `npm run lint` ma uruchamiać obecny Oxlint oraz ten guard, bez skanowania źródła tokenów `frontend/src/index.css`.

#### 2. Instrukcja bramki wizualnej

**Files**: `context/changes/panel-kancelarii-ui/visual-verification.md` (new)

**Intent**: Zapisać w artefakcie zmiany punkt startowy audytu oraz powtarzalne polecenia używane później do bramki desktop/mobile.

**Contract**: Dokument ma zapisać wynik bazowy skanu równy 0 dla `frontend/src/App.jsx` i `frontend/src/App.css`, polecenia jednorazowej instalacji `npm i -g @playwright/cli@latest` oraz `playwright-cli install --skills=agents`, a także docelowe ścieżki artefaktów z fazy 4. Nie dodaje zależności do `frontend/package.json`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` uruchamia Oxlint i guard UI bez trafień dla oczyszczonego widoku oraz komponentów UI.
- Guard UI wypisuje wynik skanu dla ustalonego zbioru plików i kończy się błędem po celowym, tymczasowym literalnym kolorze w pliku widoku.

#### Manual Verification:

- `visual-verification.md` zawiera wynik bazowy 0 oraz komplet poleceń instalacji i późniejszych zrzutów bez dodawania browser-test dependency do projektu.

**Implementation Note**: Po ukończeniu fazy i zielonych kontrolach automatycznych zatrzymaj się na potwierdzenie ręcznej weryfikacji przed przejściem dalej.

---

## Faza 2: Semantyczne tokeny panelu

### Overview

Rozszerzyć istniejące tokeny CSS do niewielkiego, profesjonalnego kontraktu granatowo‑łupkowego, obejmującego oba warianty motywu.

### Changes Required:

#### 1. Role tokenów i globalne style

**Files**: `frontend/src/index.css`, `context/changes/panel-kancelarii-ui/token-contract.md` (new)

**Intent**: Zastąpić pozostawiony po starterze zestaw wartości rolami odpowiadającymi panelowi kancelarii oraz zapisać ich uzasadnienie w artefakcie zmiany.

**Contract**: `index.css` pozostaje jedynym źródłem surowych wartości dla light i dark mode. Wprowadza role co najmniej dla powierzchni strony/karty, tekstu podstawowego i pomocniczego, obramowania, akcji primary/secondary/destructive, focus ringu, disabled i statusu informacji/błędu; nazwy opisują rolę, nie barwę. `token-contract.md` zapisuje wybrane role, źródłowy plik i linie po implementacji oraz potwierdza zachowanie dark mode.

#### 2. Usunięcie dziedzictwa startera ze styli widoku

**Files**: `frontend/src/App.css`

**Intent**: Usunąć reguły szablonu Vite, które nie dotyczą renderowanego Panelu Kancelarii, i pozostawić style layoutu odwołujące się wyłącznie do ról tokenów.

**Contract**: Przed usunięciem każdej reguły implementacja weryfikuje jej brak w renderowanym `App`. Style widoku nie zawierają surowych kolorów ani wartości arbitralnych; używają tokenów z `index.css` i nie zmieniają znaczenia istniejących klas panelu przed fazą 3.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi po aktualizacji tokenów i styli panelu.
- `npm run build` przechodzi z zachowanym light i dark CSS.

#### Manual Verification:

- W obu ustawieniach preferencji motywu kontrast tekstu, powierzchni, primary action, disabled i focus ringu jest czytelny.
- `token-contract.md` wskazuje role, źródło wartości i wynik kontroli dark mode.

**Implementation Note**: Po ukończeniu fazy i zielonych kontrolach automatycznych zatrzymaj się na potwierdzenie ręcznej weryfikacji przed przejściem dalej.

---

## Faza 3: Jeden uporządkowany widok i prymitywy

### Overview

Wydzielić minimalne komponenty współdzielone i uporządkować jeden zalogowany widok wokół anonimizacji jako głównej pracy użytkownika.

### Changes Required:

#### 1. Lokalne prymitywy UI

**Files**: `frontend/src/components/ui/Button.jsx` (new), `frontend/src/components/ui/Field.jsx` (new), `frontend/src/components/ui/Card.jsx` (new), `frontend/src/components/ui/index.js` (new), `frontend/src/components/ui/ui.css` (new)

**Intent**: Udostępnić w repozytorium jeden zestaw importowalnych elementów dla akcji, pola z etykietą i komunikatem oraz kontenera sekcji.

**Contract**: `Button` obsługuje co najmniej semantyczne warianty primary, secondary i destructive oraz natywne `disabled`; `Field` zachowuje powiązanie etykiety z kontrolką i umożliwia opis/komunikat błędu; `Card` zapewnia semantyczny kontener i nagłówek sekcji. Każdy element pobiera wygląd wyłącznie z tokenów CSS, zachowuje przekazane atrybuty dostępności i nie zawiera surowych kolorów.

#### 2. Zalogowany Panel Kancelarii

**Files**: `frontend/src/App.jsx`, `frontend/src/App.css`

**Intent**: Ustawić upload jako wizualnie dominującą pierwszą akcję, a reguły, historię i deanonymizację jako dostępne poniżej sekcje pomocnicze, bez ukrywania ich za zakładkami.

**Contract**: `App` używa lokalnych `Button`, `Field` i `Card` zamiast kolejnych ręcznie składanych odpowiedników. Zachowuje wszystkie cztery funkcje, istniejące `aria-labelledby`, role `status`/`alert`, ograniczenia formularzy, potwierdzenie usuwania, warunki disabled oraz semantykę `ready` dla deanonymizacji. Nie modyfikuje wywołań `createProductApi`, przebiegu autoryzacji, `requestGenerationRef` ani zasad czyszczenia tekstu.

### Success Criteria:

#### Automated Verification:

- `npm test`, `npm run lint` i `npm run build` przechodzą po wydzieleniu komponentów i refaktorze markup.
- Guard UI potwierdza brak literałów w `App`, jego stylach i `components/ui`.

#### Manual Verification:

- Na desktopie upload jest pierwszą i najbardziej rozpoznawalną akcją, a reguły, historia i deanonymizacja są nadal osiągalne bez zakładek.
- Każda kontrolka ma widoczną etykietę lub dostępną nazwę, a istniejące komunikaty statusu i błędu nadal są przekazywane przez odpowiednią rolę.

**Implementation Note**: Po ukończeniu fazy i zielonych kontrolach automatycznych zatrzymaj się na potwierdzenie ręcznej weryfikacji przed przejściem dalej.

---

## Faza 4: Nazwane stany i bramka wizualna

### Overview

Oddzielić stany zasobów od zawartości, pokazać pełną macierz stanów w środowisku developerskim oraz utrwalić kontrakt dla kolejnych agentów.

### Changes Required:

#### 1. Stan odczytu dokumentów i reguł

**Files**: `frontend/src/panel-resource-state.js` (new), `frontend/src/panel-resource-state.test.js` (new), `frontend/src/App.jsx`

**Intent**: Zakończyć mylenie ładowania i błędów odczytu z pustą historią lub pustą listą reguł.

**Contract**: Stan dokumentów i reguł rozróżnia loading, error i ready z danymi; komunikat empty jest dostępny dopiero po udanym odczycie pustej kolekcji. Błąd odczytu udostępnia kontrolkę ponowienia, która uruchamia istniejące funkcje ładowania i nadal respektuje bieżącą generację żądań oraz zmianę sesji. Lokalna mutacja nie usuwa już istniejących stanów disabled, error ani zasad czyszczenia danych wrażliwych.

#### 2. Dev-only kitchen sink i zrzuty

**Files**: `frontend/src/PanelKancelariiKitchenSink.jsx` (new), `frontend/src/main.jsx`, `context/changes/panel-kancelarii-ui/artifacts/desktop.png` (new), `context/changes/panel-kancelarii-ui/artifacts/mobile.png` (new), `context/changes/panel-kancelarii-ui/visual-verification.md`

**Intent**: Udostępnić powtarzalny widok wszystkich wymaganych stanów bez konta, danych kancelarii ani nowej trasy produkcyjnej.

**Contract**: W trybie `import.meta.env.DEV` parametr widoku uruchamia kitchen sink z syntetycznymi danymi, który pokazuje default, hover, focus-visible, disabled, error, empty i loading; w buildzie produkcyjnym parametr nie zmienia uruchamianego `App`. Po uruchomieniu lokalnego Vite kitchen sink jest fotografowany przez `playwright-cli` na desktopie i po `resize 390 844`; obie ścieżki artefaktów i opis sprawdzonych stanów trafiają do `visual-verification.md`. Zrzuty są ocenione względem zaakceptowanej hierarchii i tokenów przed uznaniem bramki za zaliczoną.

#### 3. Reguła dla kolejnych sesji

**Files**: `AGENTS.md`, `context/changes/panel-kancelarii-ui/visual-verification.md`

**Intent**: Zapobiec powrotowi do literałów i równoległych prymitywów przy kolejnych zmianach widoku.

**Contract**: `AGENTS.md` zawiera krótką sekcję UI dla Hermes, wskazującą `frontend/src/index.css` jako źródło tokenów, `frontend/src/components/ui/` jako katalog prymitywów, zakaz literalnych kolorów i wartości arbitralnych w widokach oraz lokalizację kitchen sinku. Dokument w katalogu zmiany zapisuje wynik skanu przed/po oraz wynik kontroli `npm run lint`.

### Success Criteria:

#### Automated Verification:

- Nowe testy Vitest pokrywają rozróżnienie loading, error i ready/empty dla dokumentów oraz reguł.
- `npm test`, `npm run lint` i `npm run build` przechodzą po dodaniu state modelu i dev-only bramki.
- Build produkcyjny nie udostępnia kitchen sinku przez parametr widoku.

#### Manual Verification:

- Kitchen sink pokazuje default, hover, focus-visible, disabled, error, empty i loading na desktopie oraz przy szerokości 390 px.
- `artifacts/desktop.png` i `artifacts/mobile.png` dokumentują zamierzoną hierarchię uploadu oraz czytelny fokus, a `visual-verification.md` zapisuje kontrolę dark mode.
- `AGENTS.md` zawiera regułę UI dla Hermes, a `visual-verification.md` zapisuje wyniki skanu 0 przed i po zmianie.

**Implementation Note**: Po ukończeniu fazy i zielonych kontrolach automatycznych zatrzymaj się na potwierdzenie ręcznej weryfikacji przed uruchomieniem `/10x-impl-review`.

## Testing Strategy

### Unit Tests:

- Dodać testy czystego modelu resource state dla loading, błędu, udanego pustego wyniku i danych gotowych do renderowania.
- Zachować istniejące testy klienta API, reguł i generacji żądań bez zmiany ich kontraktów.

### Integration Tests:

- Nie dodawać testu E2E ani `toHaveScreenshot`, ponieważ repo nie ma skonfigurowanej infrastruktury browser-testowej, a zakres tej zmiany przewiduje ręczny dowód przez `playwright-cli`.
- Uruchamiać `npm test`, `npm run lint` i `npm run build` po fazach dotykających kodu frontendowego.

### Manual Testing Steps:

1. Uruchomić zalogowany panel z prawdziwą sesją i potwierdzić upload, reguły, historię oraz ręczną deanonymizację bez regresji kontraktów.
2. Wymusić lub zasymulować błąd odczytu dokumentów i reguł, użyć ponowienia, a następnie potwierdzić, że stan pusty pojawia się wyłącznie po udanym pustym odczycie.
3. Uruchomić dev-only kitchen sink, sprawdzić siedem stanów klawiaturą i wykonać zrzuty desktop/mobile przez `playwright-cli`.
4. Sprawdzić light i dark mode, w tym kontrast tokenów oraz widoczność focus-visible.

## Performance Considerations

Zmiana nie dodaje nowych żądań API ani magazynowania po stronie klienta. Kitchen sink jest ograniczony do trybu developerskiego; stan odczytu wykorzystuje istniejące funkcje ładowania i mechanizm generacji żądań.

## Migration Notes

Brak migracji danych, API lub konfiguracji wdrożeniowej. Jedynym wymaganiem lokalnego środowiska do wykonania bramki jest globalny `@playwright/cli`; nie jest to zależność produkcyjna ani wpis w lockfile.

## References

- Research: `context/changes/panel-kancelarii-ui/research.md`
- UI checklist: `.hermes/skills/10x-ui/references/ui-quality-checklist.md`
- Existing panel: `frontend/src/App.jsx:474-671`
- Existing tokens: `frontend/src/index.css:1-51`
- Existing async/session contract: `frontend/src/App.jsx:47-90,183-231,268-336,368-465`
- Office-rules constraints: `context/changes/office-rules-management/plan.md:122-135`
- Deanonymization constraints: `context/changes/response-deanonymization/plan.md:77-100`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Środowisko i guard UI

#### Automated

- [x] 1.1 `npm run lint` uruchamia Oxlint i guard UI bez trafień dla oczyszczonego widoku oraz komponentów UI. — 8dde83d
- [x] 1.2 Guard UI wypisuje wynik skanu dla ustalonego zbioru plików i kończy się błędem po celowym, tymczasowym literalnym kolorze w pliku widoku. — 8dde83d

#### Manual

- [x] 1.3 `visual-verification.md` zawiera wynik bazowy 0 oraz komplet poleceń instalacji i późniejszych zrzutów bez dodawania browser-test dependency do projektu. — 8dde83d

### Phase 2: Semantyczne tokeny panelu

#### Automated

- [x] 2.1 `npm run lint` przechodzi po aktualizacji tokenów i styli panelu. — ece8a85
- [x] 2.2 `npm run build` przechodzi z zachowanym light i dark CSS. — ece8a85

#### Manual

- [x] 2.3 W obu ustawieniach preferencji motywu kontrast tekstu, powierzchni, primary action, disabled i focus ringu jest czytelny. — ece8a85
- [x] 2.4 `token-contract.md` wskazuje role, źródło wartości i wynik kontroli dark mode. — ece8a85

### Phase 3: Jeden uporządkowany widok i prymitywy

#### Automated

- [x] 3.1 `npm test`, `npm run lint` i `npm run build` przechodzą po wydzieleniu komponentów i refaktorze markup.
- [x] 3.2 Guard UI potwierdza brak literałów w `App`, jego stylach i `components/ui`.

#### Manual

- [x] 3.3 Na desktopie upload jest pierwszą i najbardziej rozpoznawalną akcją, a reguły, historia i deanonymizacja są nadal osiągalne bez zakładek.
- [x] 3.4 Każda kontrolka ma widoczną etykietę lub dostępną nazwę, a istniejące komunikaty statusu i błędu nadal są przekazywane przez odpowiednią rolę.

### Phase 4: Nazwane stany i bramka wizualna

#### Automated

- [x] 4.1 Nowe testy Vitest pokrywają rozróżnienie loading, error i ready/empty dla dokumentów oraz reguł. — 3f70c6b
- [x] 4.2 `npm test`, `npm run lint` i `npm run build` przechodzą po dodaniu state modelu i dev-only bramki. — 3f70c6b
- [x] 4.3 Build produkcyjny nie udostępnia kitchen sinku przez parametr widoku. — 3f70c6b

#### Manual

- [x] 4.4 Kitchen sink pokazuje default, hover, focus-visible, disabled, error, empty i loading na desktopie oraz przy szerokości 390 px. — 3f70c6b
- [x] 4.5 `artifacts/desktop.png` i `artifacts/mobile.png` dokumentują zamierzoną hierarchię uploadu oraz czytelny fokus, a `visual-verification.md` zapisuje kontrolę dark mode. — 3f70c6b
- [x] 4.6 `AGENTS.md` zawiera regułę UI dla Hermes, a `visual-verification.md` zapisuje wyniki skanu 0 przed i po zmianie. — 3f70c6b
