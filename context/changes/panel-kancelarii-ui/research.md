---
date: 2026-10-16T22:55:31+02:00
researcher: Hermes Agent
git_commit: a1334d24a5251805e397ca91a812465211eba90a
branch: master
repository: anonimizator
topic: "Audyt UI zalogowanego Panelu Kancelarii"
tags: [research, codebase, frontend, ui, panel-kancelarii]
status: complete
last_updated: 2026-10-16
last_updated_by: Hermes Agent
---

# Research: Audyt UI zalogowanego Panelu Kancelarii

**Date**: 2026-10-16T22:55:31+02:00
**Researcher**: Hermes Agent
**Git Commit**: a1334d24a5251805e397ca91a812465211eba90a
**Branch**: master
**Repository**: anonimizator

## Research Question

Jakie konkretne zarzuty dotyczące kontraktu systemu projektowego, komponentów współdzielonych i architektury widoku należy rozwiązać, aby poprawić istniejący zalogowany Panel Kancelarii w `frontend/src/App.jsx`?

## Summary

Zalogowany Panel Kancelarii jest pojedynczym widokiem renderowanym po odzyskaniu sesji w `frontend/src/App.jsx:474-671`. Repo ma małą lokalną warstwę zmiennych CSS w `frontend/src/index.css:1-51`, ale panel wykorzystuje z niej bezpośrednio w swoich stylach cztery odwołania do `--border` (`frontend/src/App.css:211,251,262,302`). Nie znaleziono importowalnych komponentów UI w `frontend/src`; kontrolki i cztery sekcje panelu są składane bezpośrednio w `App` (`frontend/src/App.jsx:485-670`).

Badany widok ma jawne stany pustych danych i lokalnych operacji, lecz początkowe odczyty dokumentów oraz reguł nie mają osobnej reprezentacji ładowania. W tej ścieżce puste tablice służą zarówno jako wartość początkowa, jak i jako stan po nieudanym odczycie (`frontend/src/App.jsx:30-31,200-232,339-349,569-570,603-604`).

Dla tej zmiany należy rozszerzyć istniejącą lokalną warstwę CSS, a nie wprowadzać nową bibliotekę UI: manifest deklaruje React, React DOM i Supabase oraz narzędzia Vite/Vitest/Oxlint (`frontend/package.json:13-25`).

## Charges

1. **Brak semantycznych tokenów dla panelu i jego stanów** — `frontend/src/index.css:2-16` definiuje globalne wartości, lecz specyficzne style panelu używają bezpośrednio tylko `--border` w `frontend/src/App.css:211,251,262,302`; przyciski panelu mają wyłącznie szerokość i padding w `frontend/src/App.css:238-241`. Użytkownik otrzymuje kontrolki, pola, powierzchnie kart i komunikaty zależne głównie od stylów przeglądarki, bez kontrolowanego wyglądu dla hover, focus-visible, disabled oraz błędu.

2. **Brak importowalnych komponentów współdzielonych** — cztery sekcje są ręcznie złożonymi `<section className="panel__card">` w `frontend/src/App.jsx:485,504,601,626`, a akcje i pola pozostają natywnymi elementami w tym samym komponencie, np. `frontend/src/App.jsx:482,497,558,613,634,648,658`. Użytkownik może napotkać rozbieżne warianty akcji i informacji zwrotnej, gdy kolejne funkcje będą kopiować własne przyciski, pola i karty zamiast korzystać z jednego kontraktu.

3. **Stan danych miesza ładowanie, pusty wynik i błąd odczytu** — `documents` i `officeRules` zaczynają jako puste tablice (`frontend/src/App.jsx:30-31`), pobieranie startuje bez flag ładowania (`frontend/src/App.jsx:339-349`), a zawartość sekcji renderuje puste komunikaty na podstawie długości tablic (`frontend/src/App.jsx:569-570,603-604,629-630`). Użytkownik może dostać komunikat o braku dokumentów lub reguł zanim odpowiedź nadejdzie, a po błędzie odczytu zobaczyć stan pusty zamiast jednoznacznego problemu z danymi.

4. **Układ odbija kolejność rozbudowy funkcji zamiast głównego zadania użytkownika** — po zalogowaniu `App` renderuje jako równorzędne karty upload, konfigurację reguł, historię oraz deanonymizację (`frontend/src/App.jsx:485-670`); style kart stosują wspólną ramkę bez hierarchii funkcji (`frontend/src/App.css:208-213`). Użytkownik, który przede wszystkim chce zanonimizować dokument, musi odczytać cztery operacyjne bloki o podobnej wadze zamiast od razu rozpoznać główną akcję i kolejne kroki.

## Detailed Findings

### Źródło wartości i komponenty

`frontend/src/main.jsx:1-10` ładuje `index.css` przed zamontowaniem `App`. Ten plik zawiera globalne tokeny tekstu, tła, obramowania, akcentu, typografii i ich warianty dla preferowanego ciemnego motywu (`frontend/src/index.css:1-51`). W `App.css` reguły szablonu Vite poprzedzają reguły panelu (`frontend/src/App.css:1-184`), natomiast panel zaczyna się w `frontend/src/App.css:186`.

W badanym widoku jedyna jawna reguła `:focus-visible` dotyczy `.counter` (`frontend/src/App.css:1-18`), której `App` nie renderuje w sekcji panelu. Kontrolki panelu mają więc natywne zachowanie przeglądarki, lecz brak repozytoryjnego kontraktu dla widocznego fokusu i stanów interakcji.

### Wejście oraz stany widoku

Aplikacja montuje jeden komponent `App` bez routera (`frontend/src/main.jsx:1-10`). Podczas odzyskiwania sesji widok zwraca tekst „Przywracanie sesji…” (`frontend/src/App.jsx:470-472`); po braku sesji renderuje formularz logowania/rejestracji (`frontend/src/App.jsx:675-719`); po sesji renderuje panel (`frontend/src/App.jsx:474-673`). `restoreSession` wywołuje Supabase `getSession()` (`frontend/src/auth.js:19-27`).

W zbadanej ścieżce bezpośredni URL nie wybiera odrębnego widoku, ponieważ konfiguracja Vite zawiera wyłącznie wtyczkę React (`frontend/vite.config.js:1-7`). Zachowanie hostingu dla głębokiego linku nie zostało potwierdzone w repozytorium, dlatego nie jest jeszcze zarzutem implementacyjnym dla tej zmiany.

Stany lokalnej operacji są obecne dla uploadu, zapisu/usuwania reguł, pobierania wyniku oraz deanonymizacji przez warunki `disabled` w `frontend/src/App.jsx:497,558,562,586,615,658`. Komunikaty zachowują role dostępności: upload używa `role="status"` (`frontend/src/App.jsx:501`), reguły i deanonymizacja przekazują `status` lub `alert` (`frontend/src/App.jsx:507,663`), a logowanie używa `role="alert"` (`frontend/src/App.jsx:717`). Te semantyki muszą pozostać przy zmianie markup/styli.

### Ograniczenia funkcjonalne

Obsługa błędu 401 unieważnia bieżące żądania, czyści stan sesyjny i przełącza na logowanie (`frontend/src/App.jsx:183-197`). Stan kancelarii jest czyszczony po zmianie tożsamości (`frontend/src/App.jsx:63-90`), a opóźnione odpowiedzi są chronione generacją żądań w odczytach i mutacjach, np. `frontend/src/App.jsx:200-231,268-336,368-465`. Refaktoryzacja UI nie może zmienić tej sekwencji.

Widok deanonymizacji ogranicza wybór do dokumentów `ready` (`frontend/src/App.jsx:468,629-662`), ogranicza tekst do 50 000 znaków (`frontend/src/App.jsx:647-655`), a wynik jest tekstem tylko do odczytu (`frontend/src/App.jsx:665-668`). Klient API wysyła do endpointu deanonymizacji wyłącznie `response_text` (`frontend/src/api.js:133-144`); dane tekstowe nie powinny zostać dodane do trwałego stanu UI.

## Architecture Insights

- Obecny wariant to istniejąca, ale częściowa warstwa CSS. Plan powinien rozszerzać `frontend/src/index.css` o krótką listę ról semantycznych dla panelu i mapować je w stylach komponentów; nie powinien tworzyć drugiej palety ani dodawać biblioteki UI bez osobnej decyzji.
- Minimalny kontrakt współdzielony musi objąć przynajmniej przycisk i pole formularza. Karta jest uzasadniona, ponieważ badany widok zawiera cztery wystąpienia wspólnego kontenera (`frontend/src/App.jsx:485,504,601,626`).
- Faza stanów powinna reprezentować default, hover, focus-visible, disabled, error, empty i loading. Obecny kod dostarcza dane dla disabled oraz części stanów empty/error, ale początkowe odczyty dokumentów/reguł wymagają odrębnego state modelu przed projektowaniem ekranu.
- Bramka wizualna może korzystać z ręcznych zrzutów desktop oraz szerokości mobilnej. Skrypty projektu uruchamiają build, lint i Vitest (`frontend/package.json:6-12`), a `frontend/vite.config.js:1-7` nie deklaruje środowiska testów przeglądarkowych ani screenshotów.

## Historical Context (from prior changes)

- Poprzedni plan reguł kancelarii wymaga osobnych formularzy/list fraz i regexów, etykiety markera, stanu aktywności, edycji, potwierdzonego usuwania oraz komunikatów `role=status|alert` (`context/changes/office-rules-management/plan.md:122-135`). To ustalenie pozostaje poparte przez aktualny markup `frontend/src/App.jsx:504-599`.
- Poprzedni plan deanonymizacji wymaga świadomego wyboru gotowego dokumentu, ręcznego wklejenia tekstu i braku trwałego zapisu odpowiedzi (`context/changes/response-deanonymization/plan.md:77-100`). Aktualna implementacja jest zgodna z tym zakresem w `frontend/src/App.jsx:626-670`.

## Related Research

- `context/changes/response-deanonymization/research.md` — badanie kontraktu deanonymizacji odpowiedzi AI.

## Open Questions

- Nie ma w repo dowodu na zachowanie produkcyjnego hostingu dla głębokich URL-i; trzeba je zbadać tylko wtedy, gdy zmiana ma wprowadzić odrębną trasę panelu.
- Brakuje zatwierdzonego wzorca wizualnego lub zrzutu bazowego. Przed implementacją należy zapisać decyzję o układzie, ale nie instalować Playwrighta wyłącznie dla tej zmiany.
