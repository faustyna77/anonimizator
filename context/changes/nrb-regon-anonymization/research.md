---
date: 2026-10-30
researcher: Hermes Agent
git_commit: 8ae457a
branch: master
repository: anonimizator
topic: "Ryzyko ujawnienia numeru rachunku oraz błędnej klasyfikacji REGON na fakturze"
tags: [research, backend, anonymization, nrb, regon]
status: complete
last_updated: 2026-10-30
last_updated_by: Hermes Agent
---

# Research: NRB i REGON w anonimizerze faktur

## Pytanie badawcze

Jak usunąć dwa potwierdzone ryzyka faktury bez poszerzania zakresu o OCR, Chrome, UI ani zewnętrzne rejestry: jawny polski numer rachunku NRB bez `PL` i poprawny 9-cyfrowy REGON oznaczany jako telefon?

## Scenariusz i ryzyko biznesowe

Prawnik przesyła do AI fakturę kontrahenta. Numer `11 1140 2004 0000 3002 1800 0002` jest prawidłowym krajowym numerem rachunku; obecnie pozostaje w treści. Prawidłowy REGON `192598474` może zostać zastąpiony markerem `[TELEFON_1]`, co degraduje mapowanie i może wprowadzić AI oraz użytkownika w błąd co do typu danych.

Wpływ: wysoki — niezamaskowany rachunek może zostać wysłany do AI. Prawdopodobieństwo: wysokie — oba formaty występują na polskich fakturach.

## Potwierdzona ścieżka w kodzie

- `backend/app/anonymization.py:122-131` waliduje tylko IBAN w formie `PL` + 26 cyfr. W rezultacie sam 26-cyfrowy NRB nie ma reguły ani walidatora.
- `backend/app/anonymization.py:170-174` przyjmuje 9 cyfr jako telefon. To obejmuje tekstowy 9-cyfrowy REGON, jeśli przejdzie granice regexu.
- `backend/app/anonymization.py:211-240` zbiera wszystkie dopasowania, a przy takim samym zakresie wybiera niższy `priority`; tę regułę trzeba wykorzystać, aby REGON wygrywał z telefonem.
- `backend/tests/pii_manifest.py` jest niezależną wyrocznią danych dla tekstu, PDF i DOCX, więc dodanie automatycznie wspieranego typu PII musi rozszerzyć manifest i fabryki syntetycznych dokumentów.
- `backend/tests/test_document_formats.py:97-113, 137-161` potwierdza przejście markerów i mappingu przez prawdziwe adaptery DOCX/PDF. To jest wystarczająca warstwa integracyjna; test e2e nie jest potrzebny.

## Walidacja danych wejściowych

- NRB ma 26 cyfr. Jest prawidłowy, gdy hipotetyczny IBAN `PL` + NRB przechodzi istniejącą walidację MOD-97. Dla syntetycznego `11114020040000300218000002` po dodaniu `PL` reszta wynosi `1`.
- 9-cyfrowy REGON używa sumy kontrolnej modulo 11 z wagami `(8, 9, 2, 3, 4, 5, 6, 7)` dla pierwszych ośmiu cyfr; reszta `10` oznacza cyfrę kontrolną `0`. Syntetyczny `192598474` przechodzi tę kontrolę.
- Sama długość lub regex nie są wystarczające: nieprawidłowy NRB musi pozostać literalny. Nieprawidłowy 9-cyfrowy REGON nie może otrzymać markera `REGON`, ale jego format jest nierozróżnialny od telefonu i nadal podlega istniejącej ochronie telefonu.

Źródła kontrolne algorytmu REGON: opis walidacji w Django (`django/django` commit `f6309cbf80`) oraz wynik wyszukiwania walidatora REGON z tymi samymi wagami. Algorytm NRB jest sprawdzany przez istniejącą implementację ISO 13616/MOD-97 po kontrolowanym dodaniu prefiksu `PL`.

## Zachowanie ochronne

1. Poprawny NRB bez `PL`, także z pojedynczymi spacjami lub myślnikami między grupami, staje się `[NRB_1]`; pierwsza zapisana pisownia pozostaje w mapowaniu.
2. Poprawny 9-cyfrowy REGON staje się `[REGON_1]`, nawet gdy ten sam tekst pasuje do wzorca telefonu.
3. Poprawny telefon nadal staje się `[TELEFON_1]`.
4. Błędny NRB nie tworzy markera ani wpisu mappingu. Błędny 9-cyfrowy REGON nie tworzy markera `REGON`; jako sekwencja o formacie telefonu może otrzymać istniejący marker `TELEFON`.
5. Zmiana działa w czystym tekście oraz w istniejących adapterach PDF/DOCX.

## Najtańszy test dający sygnał

Najtańszy sygnał to niezależne testy jednostkowe `DocumentAnonymizer` z syntetycznym prawidłowym NRB, prawidłowym REGON i zwykłym telefonem. Obecny kod powinien pokazać czerwony wynik: NRB zostaje jawną wartością, a REGON dostaje marker telefonu. Błędny REGON jest osobnym przypadkiem granicznym: nie może dostać `REGON`, ale jako dziewięciocyfrowa sekwencja nadal może dostać `TELEFON`. Następnie rozszerzony manifest przechodzi przez już istniejące prawdziwe adaptery PDF/DOCX jako ochrona przed regresją w transformacji dokumentów.

## Poza zakresem

- 14-cyfrowy REGON: nie jest źródłem zgłoszonego konfliktu z 9-cyfrowym telefonem; nie dodajemy go bez oddzielnego scenariusza i decyzji produktowej.
- OCR, skany bez warstwy tekstowej, zewnętrzna weryfikacja GUS/banków, Chrome, frontend, migracje i zmiana API.
- Użycie prawdziwych danych klientów lub rachunków.
