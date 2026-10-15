# Odwracanie znaczników odpowiedzi modelu — Plan Brief

> Full plan: `context/changes/response-deanonymization/plan.md`
> Research: `context/changes/response-deanonymization/research.md`

## What & Why

Prawnik będzie mógł przywrócić znane dane w odpowiedzi AI, która odwołuje się do markerów zanonimizowanego dokumentu, np. zamienić `[KLIENT_1]` z powrotem na właściwą wartość. Funkcja eliminuje ręczne odczytywanie mappingu, ale zachowuje granice kancelarii i nie tworzy nowego magazynu danych wrażliwych.

## Starting Point

Każdy gotowy dokument ma już własne mapowanie `marker -> original text`, serializowane do JSON i szyfrowane Fernet w `Document.encrypted_mapping`; aplikacja nie ma dziś żadnej ścieżki jego odczytu. Historia w panelu pokazuje dokumenty kancelarii, a backend ma office-scoped lookup po `document_id` i zaufanym `AccessContext.office_id`.

## Desired End State

W zalogowanym panelu użytkownik wybiera jeden gotowy dokument z własnej historii, ręcznie wkleja odpowiedź AI do 50 000 znaków i widzi deanonymizowany wynik. Backend wykorzystuje wyłącznie mapping tego dokumentu; znane markery są zastępowane, nieznane pozostają bez zmian. Wejście, wynik i odszyfrowany mapping istnieją wyłącznie podczas obsługi żądania lub bieżącej sesji UI, bez zapisu i logowania.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Miejsce wprowadzania odpowiedzi | Ręczne wklejenie w panelu webowym | Nie wymaga dostępu do DOM ani nowych uprawnień rozszerzenia. | Plan |
| Wybór mappingu | Jawny wybór jednego gotowego dokumentu z historii | Uniemożliwia niejednoznaczne mieszanie mappingów oraz jest zrozumiały dla prawnika. | Plan |
| Algorytm substytucji | Jedno `re.sub()` z callable replacement i escaped literalnymi markerami | API `re.sub` obsługuje callable `repl`, dzięki czemu wynik mappingu nie jest interpretowany jako regex ani replacement template. | Research |
| Markery nieznane | Pozostają bez zmian | Funkcja odwraca wyłącznie pewne dane pochodzące z wybranego dokumentu. | Research / Plan |
| Stany niedostępności | Jeden ogólny komunikat „wynik niedostępny” | Nie ujawnia istnienia, własności ani stanu dokumentu lub mappingu. | Plan |
| Retencja | Brak zapisu i logowania odpowiedzi oraz wyniku | Tekst może ponownie zawierać dane osobowe, więc ma pozostać tylko w żądaniu i stanie UI. | Plan |
| Limit wejścia | 50 000 znaków | Ogranicza koszt i ryzyko nadużycia, pozostając użytecznym dla odpowiedzi AI. | Plan |
| Rozszerzenie Chrome | Poza zakresem | MVP działa w panelu, bez automatycznego odczytu stron AI. | Plan |

## Scope

**In scope:**

- Chroniony endpoint deanonymizacji dla pojedynczego `document_id` i tekstu odpowiedzi.
- Office-scoped odczyt dokumentu, odszyfrowanie Fernet, walidacja mappingu JSON i bezpieczna substytucja markerów.
- Panel wyboru gotowego dokumentu, textarea, wynik bieżącej sesji i bezpieczne czyszczenie przy zmianie sesji.
- Testy izolacji A/B kancelarii, błędów mappingu, limitu, nieznanych markerów i manualne testy syntetyczne.

**Out of scope:**

- Nowa migracja lub zmiana obecnych mappingów.
- Automatyczny odczyt odpowiedzi AI, clipboard, content script oraz Chrome Web Store.
- Łączenie wielu dokumentów, cache mappingów, historia odpowiedzi, S3 lub logowanie danych deanonymizacji.

## Architecture / Approach

`App.jsx` wybiera dokument `ready` z istniejącej historii i wysyła `{response_text}` przez `createProductApi` do `POST /documents/{document_id}/deanonymize-response`. Endpoint buduje zaufany access context, a serwis pobiera dokument wyłącznie po `document_id + office_id`, odszyfrowuje jego mapping i wykonuje jednoprzebiegową literalną substytucję. Wynik wraca do stanu React; nie jest zapisywany do storage, bazy ani logów.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Bezpieczny serwis i chronione API | Office-scoped odszyfrowanie, substytucja markerów i testowalny endpoint | Ujawnienie stanu lub mappingu błędną obsługą błędu. |
| 2. Ręczny przepływ w panelu kancelarii | Wybór dokumentu, wklejenie odpowiedzi i wynik tylko w sesji UI | Pokazanie spóźnionego wyniku po zmianie kancelarii. |
| 3. Izolacja przekrojowa i akceptacja ręczna | Regresje A/B kancelarii oraz syntetyczne scenariusze akceptacyjne | Niewykryty wyciek w integracji backend–frontend. |

**Prerequisites:** Istniejące S-01 i S-02 są dostępne: dokumenty mają szyfrowane mappingi i panel ma historię dokumentów.
**Estimated effort:** ~2–3 sesje implementacyjne plus manualna akceptacja dwóch kancelarii syntetycznych.

## Open Risks & Assumptions

- Dokumenty historyczne bez mappingu będą niedostępne dla deanonymizacji, ale nadal pozostaną dostępne do pobrania.
- Marker musi być literalnym kluczem mappingu wybranego dokumentu; odpowiedzi AI, które marker zmienią lub usuną, nie zostaną automatycznie naprawione.
- Zachowanie zależy od tego, że klucz Fernet pozostaje dostępny wyłącznie po stronie serwera.

## Success Criteria (Summary)

- Właściciel dokumentu może przywrócić wyłącznie jego znane markery, a nieznane markery pozostają niezmienione.
- Druga kancelaria i wszystkie uszkodzone/niedostępne mappingi otrzymują identyczny bezpieczny rezultat bez wartości danych.
- Panel nie przechowuje wyniku poza bieżącą sesją i nie wymaga rozszerzenia Chrome.
