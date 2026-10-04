# Anonimizacja z rozszerzenia Chrome — Plan Brief

> Pełny plan: `context/changes/chrome-ai-anonymization/plan.md`

## What & Why

S-02 zamienia obecny prototyp rozszerzenia Chrome w bezpiecznego klienta istniejącego przepływu S-01. Prawnik pracujący w lokalnej aplikacji AI na `http://localhost:3000` wybierze PDF/DOCX, uruchomi anonimizację przez backend Fly i pobierze gotowy plik, aby załączyć go ręcznie do aplikacji AI.

## Starting Point

S-01 zapewnia chroniony Bearer + multipart upload, przechowywanie w S3 oraz pobieranie wyłącznie własnego zanonimizowanego wyniku. Obecne rozszerzenie MV3 jest tylko prototypem: nie ma logowania, wysyła JSON zamiast pliku, nie odbiera wyniku i ma szerokie uprawnienia `<all_urls>`.

## Desired End State

Unpacked extension działa wyłącznie w kontekście `localhost:3000`, używa istniejącej tożsamości Supabase i kontraktu S-01 bez nowego backendowego auth. Po sukcesie pobiera tylko zanonimizowany wynik; nie modyfikuje strony AI ani nie przesyła danych do innego miejsca.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Strona pierwszego pilotażu | Tylko `http://localhost:3000` | Ogranicza uprawnienia i daje deterministyczne środowisko testowe. |
| Użycie wyniku | Pobranie, następnie ręczne załączenie | Nie wymaga kruchego sterowania DOM aplikacji AI. |
| Auth i dystrybucja | Supabase login w popupie, unpacked | Zachowuje istniejącą tożsamość bez Chrome Web Store i drugiego auth. |
| Testy rozszerzenia | Node built-in tests + ręczny smoke test | Daje powtarzalne kontrakty bez dokładania bundlera lub E2E. |
| Wdrożenie | Fly.io | Jest rzeczywistym, działającym targetem repozytorium. |

## Scope

**W zakresie:**
- Minimalny manifest MV3 i konfiguracja unpacked bez sekretów.
- Logowanie Supabase, bezpieczne przechowanie sesji i token Bearer.
- Prawdziwy multipart upload PDF/DOCX do 10 MiB oraz pobranie zanonimizowanego wyniku.
- Testy Node, test manifestu, instrukcja instalacji i test ręczny dla Fly/localhost.

**Poza zakresem:**
- Automatyczne załączanie lub zmiana DOM strony AI.
- Inne strony AI, inne przeglądarki, Chrome Web Store i aplikacje desktopowe.
- Nowe endpointy auth/API, direct S3, oryginały, mapowania, OCR, batch upload i odwracanie znaczników.

## Architecture / Approach

Popup kontroluje dopuszczalny kontekst aktywnej karty i stan UI. Lokalne moduły MV3 logują do Supabase REST przez publiczną konfigurację, przechowują wyłącznie sesję w zaufanym `chrome.storage`, a service worker wywołuje istniejące `/anonymize` i `/documents/{id}/anonymized-download`. Presigned result URL trafia tylko do Chrome downloads API.

## Phases at a Glance

| Faza | Dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Fundament MV3 i logowanie | Minimalne uprawnienia, lokalna konfiguracja i sesja Supabase | Bezpieczne przechowanie tokenu w MV3. |
| 2. Upload i pobranie | Multipart Bearer upload oraz download wyniku | Dokładna zgodność z kontraktem S-01. |
| 3. Regresje i instrukcja | Bramka Node oraz runbook unpacked pilota | Powtarzalność bez prawdziwych usług. |

**Prerequisites:** S-01 jest ukończone; lokalny testowy backend, konto Supabase i publiczny Fly API są dostępne dla pilota.
**Estimated effort:** ~3 sesje przez 3 fazy.

## Open Risks & Assumptions

- `localhost:3000` pozostaje adresem aplikacji AI pilota; zmiana hosta wymaga jawnej zmiany manifestu oraz testu.
- Supabase public URL i anon key są dostarczane lokalnie do `config.js`; wartości AWS, Fernet i service-role pozostają poza rozszerzeniem.
- Wynik pobierany z S3 może wymagać ręcznego wskazania w file pickerze aplikacji AI, co jest celowym ograniczeniem MVP.

## Success Criteria (Summary)

- Zalogowany prawnik z `localhost:3000` anonimizuje PDF/DOCX do 10 MiB i pobiera tylko własny wynik.
- Manifest nie ma `<all_urls>` ani martwych content scriptów, a rozszerzenie nie zapisuje ani nie wyświetla sekretów.
- Node tests, backendowe testy S-01 oraz panelowe testy/lint/build przechodzą, a instrukcja wystarcza do unpacked smoke testu.
