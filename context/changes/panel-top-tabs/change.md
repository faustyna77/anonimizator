---
title: Panel kancelarii — górne zakładki
status: implemented
---

# Panel kancelarii — górne zakładki

## Zakres i kontrakt

Jeden widok po zalogowaniu: `frontend/src/App.jsx`. Istniejący system projektowy:
wartości w `frontend/src/index.css`, komponenty w `frontend/src/components/ui/`.
Zakładki: Anonimizacja, Historia dokumentów, Deanonimizacja, Reguły kancelarii.

## Audyt przed zmianą

- `frontend/src/App.jsx:511–727`: wszystkie funkcje wyświetlały się jednocześnie; użytkownik musiał przewijać panel, aby dotrzeć do historii lub odpowiedzi AI.
- `frontend/src/App.css:41–46`: historia i deanonimizacja dzieliły szerokość, utrudniając pracę z dłuższą odpowiedzią; każda otrzymała osobną sekcję.
- `frontend/src/components/ui/index.js:1–3`: brak współdzielonej nawigacji zakładkowej; dodano `Tabs` i `TabPanel` z obsługą klawiatury oraz relacjami ARIA.
- `frontend/src/App.jsx:503–508` i `frontend/src/index.css:151–154`: duży nagłówek dominował nad obszarem pracy; panel otrzymał kompaktowy nagłówek z informacją o koncie.

## Implementacja

- Nieaktywne panele pozostają zamontowane i są ukrywane przez `hidden`, aby zachować plik, szkice reguł i odpowiedź AI.
- Zmiana tożsamości użytkownika przywraca zakładkę anonimizacji razem z dotychczasowym czyszczeniem danych konta.
- Stany puste mają przejścia do anonimizacji, a błąd dokumentów można ponowić także w deanonimizacji.
- Nowe wartości odstępów, typografii i nawigacji pochodzą z tokenów w `index.css`; kolory wykorzystują istniejącą paletę i tryb ciemny.
- Współdzielone zakładki są pokazane w istniejącym kitchen sinku, nadal dostępnym tylko w trybie DEV.

## Weryfikacja

- `npm run lint`: 0 błędów, 3 istniejące ostrzeżenia hooków; kontrola literałów UI: 0 trafień.
- `npx vitest run src`: 50 testów zaliczonych.
- `npx playwright test --reporter=line`: test błędu historii i ponowienia zaliczony po dostosowaniu wejścia przez zakładkę.
- `npm run build`: zaliczone przez serwer testowy Playwright.
- Przeglądarka z syntetyczną sesją i dokumentem: wszystkie sekcje, zachowanie wybranego pliku, szkicu reguły i tekstu AI; End i zawijanie strzałką; szerokości 1440 i 390 px; brak poziomego przepełnienia strony na telefonie; jasny i ciemny motyw.
- Zrzuty desktop, mobile i mobile-dark ocenione wizualnie; zapisane w katalogu tymczasowym sesji jako `panel-tabs-*.png`.
- Ogólne `npm test` ma istniejący konflikt odkrywania testów: Vitest próbuje uruchomić plik Playwright. Testy jednostkowe i E2E sprawdzono osobno powyższymi poleceniami.

## Macierz stanów

| Stan | Weryfikacja |
| --- | --- |
| default | Cztery działające zakładki, jedna widoczna sekcja; desktop i mobile. |
| hover | Wspólne tokeny `action-secondary-hover` i `action-secondary-text`. |
| focus-visible | Widoczny pierścień, obsługa strzałek, Home i End; fokus na aktywnej zakładce. |
| disabled | Zachowane stany wyłączenia akcji formularzy; zakładki zawsze dostępne. |
| error | Test E2E błędu historii i skutecznego ponowienia. |
| empty | Test E2E pustej historii; zachowane puste reguły i brak gotowego dokumentu. |
| loading | Zachowane komunikaty ładowania dokumentów i reguł w odpowiednich sekcjach. |
