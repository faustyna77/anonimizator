# Shape Notes — Anonymizer Prawniczy

## Użytkownik
Prawnik z doświadczeniem z AI, codziennie anonimizuje ręcznie wszystkie rodzaje dokumentów prawniczych przed wysłaniem do narzędzi AI. Potrzebuje szybkości, późniejszego dostępu do zanonimizowanych danych i pełnej kontroli.

## Problem
Ręczne anonimizowanie dokumentów prawniczych przed wysłaniem do AI jest czasochłonne, ryzykowne (pomyłka w usunięciu danych) i pozbawia kontroli nad tym, co model zobaczy. Istotne dla kancelarii ze względu na poufność i szybkość pracy.

## MVP Scope
- Rozszerzenie Chrome działające na webowych aplikacjach AI; jest klientem backendu w chmurze
- Backend w chmurze: logowanie, panel reguł (CRUD) i anonimizacja dokumentów
- Wtyczka Chrome: klient; użytkownik z linkiem może się zarejestrować, zalogować i korzystać z usługi
- Wykrywanie PESEL, NIP, e-mail, telefon, IBAN; zamiana na znaczniki [PESEL_1], [IMIE_1] wykonywana przez backend
- Panel z regułami kancelarii i odwracanie znaczników
- CRUD reguł i słowników
- Pierwszy pilotaż dla 1–10 kancelarii

## Out of Scope (na razie)
- Inne przeglądarki (Firefox, Safari)
- Aplikacje natywne / desktopowe AI (poza webowymi w Chrome)
- Inne języki niż polski w pierwszej wersji
- Automatyczne wykrywanie imion i nazwisk (trudniejszy etap — poza v1)
