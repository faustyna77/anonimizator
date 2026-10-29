---
date: 2026-10-25T21:15:50+01:00
researcher: Hermes Agent
git_commit: fd20cdf1c9adbdd9a247dc72c0cc002261f3ce43
branch: master
repository: anonimizator
topic: "Odświeżenie ryzyk testowych panelu: kontrakt publicznej konfiguracji wydania"
tags: [research, frontend, deployment, vite, fly]
status: complete
last_updated: 2026-10-25
last_updated_by: Hermes Agent
---

# Research: Odświeżenie ryzyk testowych panelu: kontrakt publicznej konfiguracji wydania

**Date**: 2026-10-25T21:15:50+01:00
**Researcher**: Hermes Agent
**Git Commit**: fd20cdf1c9adbdd9a247dc72c0cc002261f3ce43
**Branch**: master
**Repository**: anonimizator

## Research Question

Po wdrożeniu panelu ustalić najwyższe rzeczywiste niepokryte ryzyko, które można chronić bez testu e2e, oraz wskazać ścieżkę awarii, zachowanie ochronne i najtańszy test.

## Summary

Wybrane ryzyko to nieprawidłowa publiczna konfiguracja wydania panelu. Gdy workflow przekazuje pustą albo błędną wartość `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` lub `VITE_API_BASE`, obraz Vite może się zbudować, ale prawnik może nie móc zalogować się albo panel może skierować uwierzytelnione żądania do niewłaściwego API. Ten scenariusz ma wysoki wpływ, ponieważ blokuje podstawowy przepływ panelu przed anonimizacją dokumentu.

Na sprawdzonej ścieżce wdrożenia workflow przekazuje trzy zmienne jako build arguments, Dockerfile zapisuje je do środowiska budowy i uruchamia `vite build` (`.github/workflows/fly-panel.yml:13-23`, `frontend/Dockerfile:9-15`). Kod klienta odrzuca brak konfiguracji Supabase dopiero przy inicjalizacji aplikacji (`frontend/src/auth.js:3-16`, `frontend/src/App.jsx:102-137`), a brak `VITE_API_BASE` wybiera domyślny host API (`frontend/src/App.jsx:22`).

Najtańsza warstwa ochrony to deterministyczny test Vitest dla czystego kontraktu konfiguracji, a nie e2e ani browser smoke. Wyrocznią jest warunek biznesowy: wydanie panelu jest używalne dla kancelarii wyłącznie wtedy, gdy przed pierwszą próbą logowania lub żądaniem produktu ma jawnie dostarczone trzy publiczne ustawienia wskazujące Supabase i API. Test nie powinien kopiować fallbacku ani oczekiwanej wartości z obecnej implementacji.

## Detailed Findings

### Ścieżka publicznej konfiguracji wydania

- Job deployu przekazuje `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` i `VITE_API_BASE` z GitHub Variables do `flyctl deploy` jako trzy build arguments (`.github/workflows/fly-panel.yml:13-23`). Nie ma tam sprawdzenia obecności ani formatu wartości przed wdrożeniem.
- Dockerfile deklaruje te same trzy arguments, przenosi je do `ENV` i buduje statyczny bundle (`frontend/Dockerfile:9-15`). Obraz runtime kopiuje już zbudowane pliki do nginx (`frontend/Dockerfile:17-20`), więc konfiguracja nie jest uzupełniana po starcie kontenera.
- `createSupabaseAuthClient` wymaga niepustego URL-a i klucza Supabase; przy braku któregoś rzuca błąd z komunikatem konfiguracji (`frontend/src/auth.js:3-16`). `App` łapie ten błąd podczas inicjalizacji i pozostawia `authClient` jako `null` (`frontend/src/App.jsx:102-137`), a przycisk logowania jest wtedy wyłączony (`frontend/src/App.jsx:724-771`).
- `VITE_API_BASE` ma produkcyjny fallback w module panelu (`frontend/src/App.jsx:22`) i ta wartość jest przekazywana do klienta produktów (`frontend/src/App.jsx:185-190`). Klient łączy ją z każdą ścieżką produktu (`frontend/src/api.js:27-50`). Brak jawnej wartości API nie oznacza zatem jednoznacznego błędu konfiguracji.

### Obecne pokrycie i luka

- W sprawdzonym pakiecie frontendowym `npm test` uruchamia Vitest (`frontend/package.json:6-13`). Cztery istniejące pliki testowe dotyczą kontraktów API, generatora żądań, stanu zasobów i draftów reguł; nie testują konfiguracji build-time.
- `frontend/src/api.test.js` wstrzykuje `baseUrl` do `createProductApi` i sprawdza zachowania klienta dla tokenów oraz odpowiedzi HTTP (`frontend/src/api.test.js:6-17`, `30-42`). Nie sprawdza wyboru `VITE_API_BASE` ani konfiguracji Supabase.
- Historyczny rollout ryzyka panel/API jest oznaczony jako ukończony, ale jego opis dotyczy CORS, błędów API oraz deanonymizacji, a nie kontraktu konfiguracji wdrożenia (`context/foundation/test-plan.md:31, 42, 51-56`).

### Porównane kandydaty

- Publiczna trasa polityki prywatności ma niepokryty kontrakt bezpośredniego wejścia na `/privacy-policy`: nginx zwraca SPA fallback, a `main.jsx` wybiera komponent polityki przed panelem. Ta luka jest realna, lecz ma niższy wpływ niż brak możliwości logowania całej kancelarii. Jej naturalny test to czysty kontrakt routingu plus render serwerowy komponentu (`frontend/nginx.conf:4-8`, `frontend/src/main.jsx:12-20`).
- Lista dokumentów przyjmuje dowolne poprawne JSON z odpowiedzi 200. Jeśli odpowiedź nie jest tablicą, `App` zapisuje ją jako gotowy zasób, po czym render wywołuje `documents.filter`, co może przerwać zalogowany panel (`frontend/src/api.js:99-103, 125-127`, `frontend/src/App.jsx:209-225, 485`, `frontend/src/panel-resource-state.js:5-7`). Backend deklaruje tablicę jako kontrakt `/documents` (`backend/app/main.py:210-225`). To dobry kolejny test kontraktu odpowiedzi, ale dotyczy już zalogowanego użytkownika i wymaga anomalii między wersjami/usługami.

## Code References

- `.github/workflows/fly-panel.yml:13-23` — przekazanie trzech publicznych wartości do budowy Fly.
- `frontend/Dockerfile:9-20` — użycie build arguments podczas Vite build oraz statyczny runtime nginx.
- `frontend/src/auth.js:3-16` — aktualne wymaganie dwóch wartości Supabase.
- `frontend/src/App.jsx:22` — niejawny fallback API.
- `frontend/src/App.jsx:102-137, 724-771` — ujawnienie błędu konfiguracji dopiero przy montowaniu panelu i blokada logowania.
- `frontend/src/api.js:27-50` — tworzenie URL-a żądania z przekazanej bazy API.
- `frontend/src/api.test.js:6-17, 30-42` — istniejące testy wstrzykują bazę API zamiast weryfikować konfigurację wydania.

## Architecture Insights

Panel jest statycznym bundlem Vite z trzema wartościami publicznymi wbudowanymi podczas budowy obrazu. Konfiguracja Supabase i wybór API są rozproszone między `auth.js` i `App.jsx`, więc w obecnym kształcie jedna część panelu fail-fast, a druga może skorzystać z niejawnej wartości domyślnej. Plan powinien zdefiniować jeden mały kontrakt konfiguracji współdzielony przez oba użycia, a następnie użyć go również jako preflight przed buildem/deployem.

## Historical Context (from prior changes)

- `context/foundation/test-plan.md:31, 42, 51-56` — poprzedni rollout chronił błędy API/CORS i safe deanonymization; status complete nie jest dowodem testu publicznych Vite variables.
- `fd20cdf` — polityka prywatności została opublikowana jako osobna trasa panelu; nie zmieniła konfiguracji auth/API.

## Related Research

Brak wcześniejszego researchu dotyczącego kontraktu publicznych wartości Vite dla panelu.

## Open Questions

- Tracked pliki nie ujawniają wartości GitHub Variables, więc badanie nie potwierdza, czy aktualne wartości produkcyjne są poprawne. Plan powinien chronić obecność i bezpieczny format wartości, a ręczna weryfikacja/deploy smoke pozostaje potrzebna dla semantycznie błędnego, lecz syntaktycznie poprawnego hosta.
- Należy podczas planowania ustalić, czy walidacja ma odrzucać wyłącznie brak wartości, czy również nie-HTTPS/niepoprawny URL. Rekomendowane minimum to niepusty URL HTTPS dla Supabase i API oraz niepusty publiczny klucz Supabase; lokalne środowisko deweloperskie może wymagać jawnego wyjątku dla loopback HTTP.
