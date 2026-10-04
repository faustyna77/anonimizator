# Przepływ anonimizacji dokumentu — brief planu

> Pełny plan: `context/changes/document-anonymization-flow/plan.md`

## What & Why

S-01 zmienia chroniony stub API w pierwszy użyteczny przepływ dla prawnika: upload jednego PDF/DOCX, wykrycie pięciu typów danych poufnych oraz pobranie zanonimizowanej wersji. To jest główny wynik MVP — dokument może zostać przygotowany do pracy z AI bez ręcznego wyszukiwania PESEL, NIP, e-maili, telefonów i IBAN.

## Starting Point

F-01 dostarcza logowanie Supabase oraz serwerowy kontekst kancelarii, ale `POST /anonymize` zwraca statyczny wynik. Projekt ma biblioteki do odczytu PDF/DOCX, lecz nie ma uploadu, procesora, storage S3, historii dokumentów ani modeli danych dla wyników.

## Desired End State

Zalogowany użytkownik przesyła pojedynczy PDF albo DOCX do 10 MB i otrzymuje zanonimizowaną wersję w tym samym formacie. Oryginał i wynik są zachowane w AWS S3, mapa znaczników jest zaszyfrowana w PostgreSQL na Fly, a panel pokazuje wyłącznie historię bieżącej kancelarii.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Wynik PDF | Zachowany układ i strony | Prawnik musi otrzymać dokument bliski oryginałowi, nie sam tekst. |
| Wynik DOCX | Zachowany format DOCX | Format wejściowy jest przewidywalny dla użytkownika. |
| Znaczniki | Numeracja per dokument i typ | Ogranicza korelację między dokumentami i wspiera S-04. |
| Upload | Jeden plik, limit 10 MB | Utrzymuje synchroniczne MVP bez kolejki zadań. |
| Pliki | Oryginał i wynik w AWS S3 | Fly volume nie jest trwałym storage dla dokumentów. |
| Mapowanie | Zaszyfrowany JSON w PostgreSQL na Fly | S-04 odzyska mapowanie bez ekspozycji go w S3 lub kliencie. |
| Historia | Lista dokumentów kancelarii | Użytkownik odzyskuje własne wyniki po odświeżeniu panelu. |

## Scope

**In scope:**
- PDF/DOCX z warstwą tekstową; PESEL, NIP, e-mail, telefon i IBAN.
- Chroniony upload, metadane dokumentów, AWS S3, zaszyfrowane mapowanie i bezpieczne pobranie wyniku.
- Panelowy upload jednego pliku oraz historia własnych wyników.
- Testy izolacji kancelarii, formatów, limitu i fałszywego S3.

**Out of scope:**
- OCR, skanowane PDF, batch upload i pliki ponad 10 MB.
- Rozszerzenie Chrome, reguły kancelarii, odwracanie znaczników i automatyczne wykrywanie imion/nazwisk.
- Bezpośrednie pobieranie oryginałów lub mapowań przez panel.

## Architecture / Approach

Panel przesyła `FormData` z tokenem Supabase do chronionego `/anonymize`. Backend wyprowadza kancelarię z `AccessContext`, zapisuje oryginał i wynik pod serwerowo utworzonymi kluczami S3, a w PostgreSQL przechowuje metadane dokumentu oraz zaszyfrowane mapowanie. Lista i pobranie wyniku zawsze filtrują po kancelarii; link S3 powstaje dopiero po tej kontroli.

## Phases at a Glance

| Faza | Dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Dane i storage | S3, szyfrowanie, modele i migrację | Sekrety lub własność kancelarii w złym miejscu. |
| 2. Upload i anonimizacja | PDF/DOCX, pięć typów danych i wynik | Układ PDF oraz granice formatów. |
| 3. Historia i pobranie | Panelowy upload, lista i pobranie | Dostęp do danych innej kancelarii. |
| 4. Regresje i dokumentacja | Powtarzalne testy oraz runbook S3 | Przypadkowe użycie zewnętrznych usług w testach. |

**Prerequisites:** bucket AWS S3 oraz server-only poświadczenia i klucz szyfrowania skonfigurowane poza repozytorium.

## Open Risks & Assumptions

- Skanowane PDF bez tekstu będą odrzucone; OCR jest osobną przyszłą zmianą.
- Zachowanie układu PDF jest możliwie zbliżone, nie gwarantuje identycznej typografii dla długich znaczników.
- Oryginały pozostają w S3 zgodnie z decyzją użytkownika; polityka retencji/usuwania wymaga osobnej decyzji produktowej.

## Success Criteria (Summary)

- Prawnik otrzymuje PDF/DOCX z pięcioma typami danych zastąpionymi znacznikami.
- Panel zachowuje historię własnej kancelarii i udostępnia wyłącznie zanonimizowane wyniki.
- Testy dowodzą izolacji kancelarii, braku dostępu do mapowania/originalu i działania bez realnego AWS w CI.
