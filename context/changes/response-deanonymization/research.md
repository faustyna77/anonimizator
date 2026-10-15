---
date: 2026-10-14T20:48:12+0200
researcher: Hermes Agent
git_commit: c6c0f356b5dcbea773578834f7796196944a632d
branch: master
repository: anonimizator
topic: "S-04: bezpieczne odwracanie markerów odpowiedzi modelu"
tags: [research, codebase, deanonymization, document-mapping, mcp, exa, context7]
status: complete
last_updated: 2026-10-14
last_updated_by: Hermes Agent
---

# Research: S-04 — bezpieczne odwracanie markerów odpowiedzi modelu

**Date**: 2026-10-14T20:48:12+0200
**Researcher**: Hermes Agent
**Git Commit**: `c6c0f356b5dcbea773578834f7796196944a632d`
**Branch**: `master`
**Repository**: `anonimizator`

## Research Question

Jaka istniejąca mapa plików, konwencje bezpieczeństwa oraz aktualne API biblioteki powinny ukształtować S-04, aby prawnik mógł odwracać znane markery z odpowiedzi modelu na podstawie wybranego dokumentu, bez ujawniania mapowania innej kancelarii? Nieznane, zmienione i błędnie sformatowane markery w odpowiedzi mają pozostać bez zmian.

## Summary

S-04 ma gotową serwerową granicę danych: mapowanie `{marker: original_value}` jest tworzone per dokument, serializowane do JSON i szyfrowane Fernet przed zapisem; dokument jest odczytywany przez `document_id` wraz z serwerowo wyprowadzonym `office_id` (`backend/app/document_service.py:84-100`, `backend/app/document_repository.py:41-52`). W sprawdzonych trasach `backend/app/main.py:114-222` nie ma jeszcze endpointu ani serwisu odszyfrowującego mapowanie i zwracającego przekształcony tekst.

Wybieramy `re.sub()` z callable `repl` z CPython `re`, bo aktualna dokumentacja CPython mówi, że callable jest wywoływany dla każdego niepokrywającego się dopasowania i zwraca tekst zastępczy; pozwala to zwrócić wartość wyłącznie dla klucza obecnego w mapie dokumentu, a dla nieznanego lub błędnego markera zwrócić oryginalne dopasowanie. Zewnętrzny research odbył się w świeżej sesji Hermes: Exa dostarczył kandydatów i źródła techniczne, a Context7 wykonał `resolve-library-id` → `query-docs` dla zwycięzcy `/python/cpython`.

## Detailed Findings

### Dostęp, własność i szyfrowane mapowanie

- `get_current_access_context()` tworzy `AccessContext` dopiero po weryfikacji Bearer tokenu i przypisuje `office_id` z profilu; klient nie przekazuje identyfikatora kancelarii (`backend/app/auth.py:36-80`).
- W sprawdzonej funkcji `get_document_for_access_context()` warunek obejmuje dokładnie `Document.id` i `access_context.office_id`; ten lookup może być wspólną bramką S-04 dla dokumentu wybranego przez użytkownika (`backend/app/document_repository.py:41-52`).
- Dla dokumentu po anonimizacji `DocumentProcessingService` otrzymuje mapę z adaptera formatu, koduje ją jako deterministyczny JSON UTF-8, szyfruje `DocumentMappingCipher` i zapisuje jako `encrypted_mapping` (`backend/app/document_service.py:84-100`).
- Model `Document` przechowuje `encrypted_mapping` jako nullable `LargeBinary`, a status dokumentu może być `processing`, `ready` lub `failed` (`backend/app/models.py:101-132`). S-04 musi zdefiniować kontrolowaną odpowiedź dla dokumentu niegotowego lub bez mapowania.
- `DocumentMappingCipher.decrypt()` zwraca bajty i nie tłumaczy błędu Fernet ani błędu dekodowania JSON na błąd produktu (`backend/app/storage.py:25-41`). Nowy serwis powinien zamknąć tę granicę bez przekazywania szyfrogramu, mapowania ani pierwotnych danych do API.

### Obecna powierzchnia API i testowa granica prywatności

- W sprawdzonych trasach dokumentowych API istnieją upload, historia i URL pobrania wyniku; `POST /anonymize` zwraca metadane, lecz nie mapowanie (`backend/app/main.py:158-222`).
- Test powierzchni API obecnie zakłada dokładnie dwa pathy zaczynające się od `/documents` i sprawdza brak `encrypted_mapping` w OpenAPI (`backend/tests/test_document_api_surface.py:8-20`). S-04 będzie musiało świadomie zmienić ten kontrakt, zachowując zakaz ekspozycji mapowania.
- Istniejące testy już pokazują wzorzec izolacji: dostęp drugiej kancelarii do dokumentu pierwszej zwraca `None` w repozytorium (`backend/tests/test_document_repository.py:32-74`) oraz nie otrzymuje URL wyniku (`backend/tests/test_document_access.py:71-126`).

### Klient i luka integracyjna odpowiedzi AI

- Rozszerzenie trzyma `document_id` tylko w synchronicznym łańcuchu upload → URL pobrania → `chrome.downloads.download` (`chrome-extension/src/document-flow.mjs:7-20`).
- W aktualnym manifeście nie ma `content_scripts` ani uprawnienia `scripting`; ma tylko `activeTab`, `storage` i `downloads` (`chrome-extension/manifest.json:12-29`). W obecnym pilocie rozszerzenie nie ma ścieżki odbierania lub modyfikowania tekstu odpowiedzi modelu.
- S-02 jawnie wyłączyło automatyzację DOM, wklejanie tekstu i odwracanie markerów; odpowiedź AI musi więc dostać nową, świadomie wybraną granicę wejścia w S-04 (`context/changes/chrome-ai-anonymization/plan.md:23-29,100-102`).

### External research: kandydaci i aktualne API

Exa w świeżej sesji zwróciła trzy kandydaty techniczne dla substytucji markerów:

1. `re.sub()` z callable `repl` — dokumentacja Python `re` jako źródło techniczne: https://docs.python.org/3/library/re.html.
2. `str.replace()` / `str.translate()` — prostsze zamiany, bez callbacka pozwalającego warunkowo zachować nieznany marker.
3. `pywikibot.textlib.replaceExcept()` — dodatkowa zależność i mechanizm wyjątków niewspółmierny do tej serwerowej transformacji.

Context7 rozwiązał `libraryName=python` do `/python/cpython`, a następnie `query-docs` zwrócił aktualny kontrakt: „If a function, it is called for every non-overlapping occurrence and takes a single Match argument, returning the replacement string.” Ten fragment opisuje bezpośrednio mechanizm potrzebny do funkcji zwracającej `mapping.get(match.group(0), match.group(0))`.

## Code References

- `backend/app/auth.py:36-80` — weryfikacja tokenu i serwerowo wyprowadzony kontekst kancelarii.
- `backend/app/document_repository.py:41-52,66-82` — scoped lookup dokumentu i zapis zaszyfrowanego mapowania.
- `backend/app/document_service.py:84-100,162-197` — szyfrowanie mapowania oraz wzorzec dostępu do dokumentu przez usługę.
- `backend/app/storage.py:25-41` — Fernet encrypt/decrypt, obecnie bez translacji błędów produktu.
- `backend/app/models.py:101-132` — status dokumentu i nullable `encrypted_mapping`.
- `backend/app/main.py:158-222` — obecne chronione trasy dokumentów.
- `backend/app/anonymization.py:178-253` — generowanie markerów i mapy per instancja anonimizatora.
- `chrome-extension/src/document-flow.mjs:7-20` — krótkotrwałe użycie `document_id` w rozszerzeniu.
- `chrome-extension/manifest.json:12-29` — brak mechanizmu odczytu DOM odpowiedzi AI.

## Architecture Insights

- Serwer powinien przyjąć `document_id` i tekst odpowiedzi, pobrać dokument tylko przez istniejący office-scoped lookup, odszyfrować mapę wewnątrz serwisu i zwrócić wyłącznie przekształcony tekst. Nie powinien zwracać mapowania, obiektowych kluczy S3 ani oryginalnego dokumentu.
- Matcher powinien ograniczać się do obecnej składni literalnego markera i callback powinien zastępować wyłącznie znane klucze mapowania. To zachowuje nieznane, zmienione oraz malformed markery bez zgadywania ich wartości.
- Warstwa API powinna wstrzykiwać nowy protokół serwisu podobny do `DocumentAccessProcessor` (`backend/app/main.py:41-46`), aby testy API mogły użyć kontrolowanej implementacji bez bazy, S3 ani klucza Fernet.
- Nowa powierzchnia klienta nie wynika automatycznie z obecnego rozszerzenia. Wybór panelowego pola do ręcznego wklejenia odpowiedzi jest najmniejszą nową granicą; automatyczny odczyt strony AI wymagałby osobnej decyzji o content scriptach, host permissions i prywatności.

## Historical Context (from prior changes)

- S-01 ustanowił zaszyfrowane mapowanie per dokument oraz nieudostępnianie go klientowi (`context/archive/2026-10-03-document-anonymization-flow/plan.md:96-103,136-142`).
- S-02 ograniczył pilot rozszerzenia do ręcznego pobrania i załączenia, bez czytania/modyfikacji DOM (`context/changes/chrome-ai-anonymization/plan.md:23-29,92-102`).
- S-03 rozszerzył nazwy markerów o reguły kancelarii, np. `[KLIENT_1]`, oraz pozostawił snapshot reguł po stronie serwera (`context/changes/office-rules-management/plan.md:50-60,92-110`).

## Related Research

Brak wcześniejszego artefaktu `research.md` dla `response-deanonymization` w sprawdzonych katalogach `context/changes/` i `context/archive/`.

## Open Questions

1. Czy MVP S-04 przyjmuje odpowiedź modelu przez ręczne wklejenie w panelu, przez popup rozszerzenia czy przez nową integrację z DOM aplikacji AI?
2. Czy dokument `failed`, `processing`, bez `encrypted_mapping` albo z uszkodzonym szyfrogramem zwraca jednolity bezpieczny `404`, czy rozróżniony błąd kontrolowany?
3. Jaki jest limit długości odpowiedzi i polityka logowania/retencji plaintextu odpowiedzi modelu?
4. Czy użytkownik zawsze wybiera `document_id`, czy interfejs może zaproponować ostatni gotowy dokument bez zmiany granicy autoryzacji?
5. Czy odpowiedź mieszająca markery z więcej niż jednego dokumentu ma być odrzucona, czy ma odwracać wyłącznie markery wybranego dokumentu?
