# Anonimizacja NRB i REGON — Plan Brief

> Full plan: `context/changes/nrb-regon-anonymization/plan.md`
> Research: `context/changes/nrb-regon-anonymization/research.md`

## What & Why

Faktura może zawierać 26-cyfrowy NRB bez prefiksu `PL`; dzisiejszy silnik go nie maskuje. Poprawny 9-cyfrowy REGON pasuje do telefonu i otrzymuje błędny typ markera. Zmiana dodaje dwie walidowane klasy automatycznej anonimizacji, aby dokument nie ujawniał rachunku i zachowywał semantykę identyfikatora gospodarczego.

## Starting Point

`DocumentAnonymizer` ma reguły IBAN, e-mail, PESEL, NIP i telefonu. IBAN wymaga `PL`; telefon przyjmuje dziewięć cyfr. Niezależny manifest PII napędza testy silnika oraz adapterów PDF/DOCX.

## Desired End State

Poprawny NRB jest zastępowany przez `[NRB_1]`, a poprawny 9-cyfrowy REGON przez `[REGON_1]` przed telefonem. Niepoprawne wartości zostają bez zmian. Wszystkie siedem automatycznie wspieranych klas są pokryte syntetycznym manifestem i przechodzą przez PDF/DOCX.

## Scope

In scope:
- walidacja i kanonizacja NRB/REGON w backendowym silniku;
- jawny priorytet REGON nad telefonem;
- niezależne testy, manifest i testy PDF/DOCX;
- korekta deklaracji obsługiwanych typów w README.

Out of scope:
- 14-cyfrowy REGON, OCR, Chrome, UI, endpointy, migracje i zewnętrzne sprawdzanie istnienia firmy/rachunku.

## Phases at a Glance

| Phase | Deliverable | Risk guarded |
| --- | --- | --- |
| 1. Kontrakty regresji | Czerwone testy jednostkowe i rozszerzony syntetyczny manifest | Kod nadal przepuszcza NRB lub klasyfikuje REGON jako telefon. |
| 2. Silnik walidacji | Minimalne reguły NRB i REGON z priorytetem | Format bez sumy kontrolnej powoduje fałszywe anonimizacje. |
| 3. Granica dokumentu | PDF/DOCX i dokumentacja wspieranych typów | Poprawka działa tylko dla gołego tekstu lub nie ma pełnego mappingu. |

Prerequisites: istniejący Pytest i zależności backendu; brak zmiany infrastruktury, bazy lub zewnętrznych usług.
