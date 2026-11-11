# Anonimizator Prawniczy
LINK DO FILMU: https://youtu.be/nAcnHLg8Y9o
Narzędzie dla kancelarii prawnych, które zastępuje rozpoznane dane w dokumentach PDF i DOCX markerami, np. `[PESEL_1]` lub `[EMAIL_1]`. Pozwala pobrać wynik, wykorzystać go w aplikacji AI, a następnie przywrócić dane w wklejonej odpowiedzi na podstawie mapowania wybranego dokumentu.

Projekt obejmuje panel WWW (React), API (FastAPI) i rozszerzenie Chrome Manifest V3. Uwierzytelnianie obsługuje Supabase Auth, metadane i zaszyfrowane mapowania są przechowywane w PostgreSQL, a pliki w prywatnym AWS S3.

## Spis treści

- [Możliwości i ograniczenia](#możliwości-i-ograniczenia)
- [Instrukcja obsługi panelu](#instrukcja-obsługi-panelu)
- [Przykłady zastosowania — use cases](#przykłady-zastosowania--use-cases)
- [Rozszerzenie Chrome](#rozszerzenie-chrome)
- [Uruchomienie lokalne](#uruchomienie-lokalne)
- [API](#api)
- [Przechowywanie danych](#przechowywanie-danych)
- [Testy i kontrola jakości](#testy-i-kontrola-jakości)
- [Rozwiązywanie problemów](#rozwiązywanie-problemów)
- [Struktura projektu i wdrożenie](#struktura-projektu-i-wdrożenie)

## Możliwości i ograniczenia

| Obszar | Dostępne funkcje |
| --- | --- |
| Dokumenty | Jeden PDF z warstwą tekstową albo DOCX na żądanie; wynik w tym samym formacie |
| Rozmiar | Maksymalnie 10 MiB, czyli 10 485 760 bajtów (w interfejsie opisane jako „10 MB”) |
| Wbudowane wykrywanie | PESEL, NIP, REGON 9-cyfrowy, e-mail, polskie numery telefonu, polski NRB i IBAN z prefiksem `PL` |
| Własne reguły | Frazy niezależne od wielkości liter oraz wyrażenia regularne RE2; dodawanie, edycja, wyłączanie i usuwanie |
| Historia | Lista dokumentów kancelarii, status przetwarzania i pobieranie gotowych wyników |
| Deanonimizacja | Przywracanie znanych markerów w tekście odpowiedzi AI, do 50 000 znaków |

Markery są numerowane osobno dla każdego typu danych i dokumentu. Powtórzenia tej samej rozpoznanej wartości w dokumencie otrzymują ten sam marker. Numery identyfikacyjne i rachunki są sprawdzane lokalnymi sumami kontrolnymi, bez odpytywania zewnętrznych rejestrów.

**Zakres obecnej wersji:**

- Brak OCR: skan bez użytecznej warstwy tekstowej nie jest obsługiwany. Obrazy i skanowane fragmenty dokumentów nie są analizowane pod kątem danych.
- Imiona, nazwiska, adresy, nazwy firm i sygnatury nie mają automatycznego rozpoznawania semantycznego — można dodać dla nich własne frazy lub regexy.
- Brak przetwarzania wsadowego, edytora ręcznej korekty markerów i odtwarzania całego pliku przez deanonimizację. Przywracanie danych dotyczy wklejonego tekstu.
- Narzędzie nie wywołuje modelu AI. Wysłanie wyniku do AI oraz wklejenie odpowiedzi wykonuje użytkownik.
- Obsługa DOCX obejmuje tekst akapitów, tabel, nagłówków i stopek; nie jest pełnym czyszczeniem wszystkich metadanych ani osadzonych obiektów.

Przed przekazaniem wyniku dalej sprawdź treść i układ pobranego dokumentu, szczególnie elementy poza warstwą tekstową.

## Instrukcja obsługi panelu

### 1. Utwórz konto i zaloguj się

1. Otwórz panel pod adresem udostępnionym przez operatora; konfiguracja wdrożenia w repozytorium wskazuje `https://anonimizator-panel.fly.dev/`.
2. Wybierz **Utwórz konto**, podaj e-mail i hasło, a następnie kliknij **Zarejestruj się**.
3. Jeżeli pojawi się prośba o potwierdzenie adresu, skorzystaj z wiadomości e-mail i zaloguj się ponownie.
4. Po zalogowaniu zobaczysz zakładki **Reguły kancelarii**, **Anonimizacja**, **Historia dokumentów** i **Deanonimizacja**.

Profil i kancelaria są przypisywane po stronie serwera przy pierwszym dostępie do API. Obecny model tworzy osobną kancelarię dla każdego konta; panel nie zawiera zapraszania członków zespołu ani przełączania kancelarii.

### 2. Opcjonalnie dodaj reguły kancelarii

1. Przejdź do **Reguły kancelarii**.
2. W sekcji **Frazy** wpisz np. `Anna Przykładowa`, a jako **Etykieta markera** podaj `KLIENT`.
3. Pozostaw zaznaczone **Reguła aktywna** i kliknij **Dodaj regułę**.
4. Dla wzorców powtarzalnych użyj sekcji **Regexy**, np. `SPRAWA-[0-9]{4}/[0-9]{2}` z etykietą `SPRAWA`.

Fraza może mieć do 255 znaków, regex do 512, a etykieta do 32. Etykieta musi zaczynać się wielką literą `A–Z`; dalej dopuszczalne są wielkie litery, cyfry i `_`. Nazwy `PESEL`, `NIP`, `REGON`, `EMAIL`, `TELEFON`, `NRB` i `IBAN` są zarezerwowane.

Regex powinien dopasowywać samą wartość do ukrycia. Silnik RE2 nie obsługuje m.in. lookaround i odwołań wstecznych; aplikacja dodatkowo odrzuca `^`, `$`, `\b`, `\B` oraz wzorce dopasowujące pusty tekst.

Aby zmienić regułę, wybierz **Edytuj**, a potem **Zapisz zmiany**. Wyłączenie odbywa się przez odznaczenie **Reguła aktywna** podczas edycji; **Usuń** wymaga potwierdzenia. Zmiany dotyczą kolejnych przesłanych dokumentów i nie przeliczają wcześniejszych wyników.

### 3. Zanonimizuj dokument i pobierz wynik

1. W zakładce **Anonimizacja** wybierz jeden plik `.pdf` lub `.docx` do 10 MiB.
2. Kliknij **Anonimizuj dokument** i poczekaj na komunikat o gotowym wyniku.
3. Wybierz **Przejdź do historii** lub otwórz **Historia dokumentów**.
4. Przy dokumencie ze statusem `ready` kliknij **Pobierz wynik**.
5. Otwórz pobrany plik i sprawdź zastąpienie danych markerami.

Status `processing` oznacza przetwarzanie, `ready` — gotowy wynik, a `failed` — niepowodzenie. Pobieranie jest dostępne tylko dla `ready`. Link do wyniku jest ważny przez 5 minut; po wygaśnięciu ponownie kliknij **Pobierz wynik**.

### 4. Użyj wyniku w AI i przywróć dane w odpowiedzi

1. Ręcznie załącz zanonimizowany plik w wybranej aplikacji AI.
2. W poleceniu poproś o zachowanie markerów w niezmienionej postaci, np. `[KLIENT_1]`.
3. Skopiuj odpowiedź AI i wróć do zakładki **Deanonimizacja**.
4. W polu **Dokument źródłowy** wybierz dokładnie ten dokument, którego wynik wysłano do AI.
5. Wklej tekst do pola **Odpowiedź AI** (maksymalnie 50 000 znaków) i kliknij **Przywróć dane**.
6. Skopiuj tekst z pola **Wynik deanonymizacji**.

Przywracane są tylko rozpoznane, niezmienione markery wybranego dokumentu. Nieznane lub zmodyfikowane markery pozostają w tekście. Numeracja zaczyna się od nowa w każdym dokumencie, więc wybór innego dokumentu może przywrócić niewłaściwe wartości. Dokument bez zapisanych podmian nie ma mapowania umożliwiającego przywrócenie danych. Tekst odpowiedzi i wynik nie są zapisywane przez tę operację w bazie ani S3.

## Przykłady zastosowania — use cases

### UC-01: Przygotowanie projektu pisma z pomocą AI

**Cel:** opracować projekt wezwania na podstawie dokumentu, zastępując dane klienta markerami.

1. Dodaj aktywną frazę `Anna Przykładowa` z etykietą `KLIENT`.
2. Prześlij DOCX zawierający poniższy przykładowy tekst:

   ```text
   Klient: Anna Przykładowa. Kontakt: klient@example.com
   Proszę przygotować wezwanie do zapłaty.
   ```

3. Pobierz wynik. Dla tego fragmentu oczekiwane podmiany to:

   ```text
   Klient: [KLIENT_1]. Kontakt: [EMAIL_1]
   Proszę przygotować wezwanie do zapłaty.
   ```

4. Załącz wynik w AI i poproś o projekt pisma z zachowaniem markerów.
5. Jeśli AI zwróci `Działając w imieniu [KLIENT_1], proszę o kontakt na [EMAIL_1].`, wklej tę odpowiedź do **Deanonimizacji** i wybierz dokument z kroku 2.

**Rezultat:** `Działając w imieniu Anna Przykładowa, proszę o kontakt na klient@example.com.` Narzędzie podmienia wartości dosłownie — nie odmienia nazwisk ani nie poprawia gramatyki odpowiedzi.

### UC-02: Ukrywanie wewnętrznych oznaczeń spraw

**Cel:** usuwać z kolejnych dokumentów oznaczenia w formacie `SPRAWA-2026/11`.

1. W **Regułach kancelarii → Regexy** dodaj wzorzec `SPRAWA-[0-9]{4}/[0-9]{2}` i etykietę `SPRAWA`.
2. Prześlij dokument z takim oznaczeniem.
3. Pobierz wynik; oznaczenie zostanie zastąpione markerem `[SPRAWA_1]`.
4. Kolejne różne oznaczenie otrzyma kolejny numer, a powtórzenie tej samej wartości — ten sam marker w obrębie dokumentu.

**Rezultat:** aktywna reguła jest stosowana również do następnych przesyłanych dokumentów. Jej wyłączenie nie zmienia już zapisanych plików.

### UC-03: Ponowne pobranie wyniku

**Cel:** wrócić do wcześniej przetworzonego dokumentu bez ponownego przesyłania oryginału.

1. Zaloguj się na to samo konto.
2. Otwórz **Historię dokumentów** i znajdź dokument po nazwie.
3. Przy statusie `ready` kliknij **Pobierz wynik**.

**Rezultat:** otrzymasz nowy, krótkotrwały link do zapisanego wyniku. Reguły dodane po przetworzeniu dokumentu nie zostaną do niego zastosowane.

## Rozszerzenie Chrome

Rozszerzenie korzysta z tego samego chronionego API i służy do anonimizowania pojedynczego pliku podczas pracy z lokalną aplikacją AI pod adresem **`http://127.0.0.1:5173/`**. Jest celowo ograniczone do tej strony; nie integruje się z ChatGPT ani innymi witrynami.

Dystrybucja użytkowa odbywa się przez Chrome Web Store po zatwierdzeniu publikacji przez Google. Repozytorium nie podaje identyfikatora opublikowanej oferty — link udostępnia wydawca.

1. Otwórz udostępnioną ofertę i wybierz **Dodaj do Chrome**.
2. Przypnij rozszerzenie i otwórz dozwoloną lokalną aplikację AI w aktywnej karcie.
3. Otwórz rozszerzenie, zaloguj się i wybierz jeden PDF lub DOCX do 10 MiB.
4. Uruchom anonimizację, pobierz wynik i ręcznie załącz go w aplikacji AI.

Rozszerzenie nie odczytuje ani nie modyfikuje treści strony AI i nie załącza plików automatycznie. Użytkownik instalujący wydanie ze sklepu nie tworzy `config.js`, nie pobiera ZIP i nie włącza trybu programisty.

- [Instrukcja rozszerzenia](chrome-extension/README.md)
- [Przygotowanie publikacji przez wydawcę](chrome-extension/STORE_SUBMISSION.md)
- [Polityka prywatności](https://anonimizator-panel.fly.dev/privacy-policy)

## Uruchomienie lokalne

### Wymagania

- Python **3.11+**; poniższe polecenia używają `python3.11`.
- Node.js **22.12+** i npm (frontend wykorzystuje Vite 8).
- Działający PostgreSQL z bazą aplikacji.
- Projekt Supabase z włączonym logowaniem e-mail/hasło; ustawienia potwierdzania e-mail i adresów przekierowań dostosowane do lokalnego panelu.
- Prywatny bucket AWS S3 oraz poświadczenia backendu do zapisu i odczytu plików.

Pełny przepływ wymaga tych usług. Samo uruchomienie `/health` i testów jednostkowych nie wymaga skonfigurowanego Supabase ani AWS. Polecenia dla backendu wykonuj w katalogu głównym repozytorium; składnia zakłada macOS/Linux.

### 1. Zainstaluj backend

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
```

Jeśli masz już środowisko `.venv` z Pythonem 3.11+, użyj go. Do samego uruchamiania aplikacji wystarczy `backend/requirements.txt`; wariant `requirements-dev.txt` instaluje także narzędzia testowe.

### 2. Skonfiguruj backend

Jeśli plik `.env` jeszcze nie istnieje, utwórz go z szablonu (nie nadpisuj własnej konfiguracji):

```bash
cp .env.example .env
```

Uzupełnij wartości w `.env`:

| Zmienna | Znaczenie |
| --- | --- |
| `APP_ENVIRONMENT` | Lokalnie `development`; dokumentacja API jest dostępna też dla `local` i `test` |
| `PANEL_ALLOWED_ORIGINS` | Dokładny origin panelu, np. `http://localhost:5173`; wiele wartości rozdziel przecinkami |
| `DATABASE_URL` | Połączenie do lokalnej bazy, np. `postgresql+psycopg://postgres:postgres@localhost:5432/anonimizator` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Adres projektu Supabase i publiczny klucz anon |
| `S3_BUCKET`, `S3_REGION` | Nazwa prywatnego bucketa i region AWS |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Poświadczenia S3, wyłącznie dla backendu |
| `DOCUMENT_MAPPING_ENCRYPTION_KEY` | Klucz Fernet szyfrujący mapowania markerów |

Klucz Fernet wygeneruj lokalnie i wpisz do `DOCUMENT_MAPPING_ENCRYPTION_KEY`:

```bash
.venv/bin/python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Zachowaj ten klucz dla zapisanych dokumentów — jego zmiana bez migracji mapowań uniemożliwi ich odszyfrowanie. `SUPABASE_SERVICE_ROLE_KEY` jest zarezerwowany dla operacji administracyjnych po stronie serwera i nie jest wymagany przez bieżący przepływ użytkownika.

### 3. Przygotuj bazę i uruchom API

Utwórz pustą lokalną bazę wskazaną w `DATABASE_URL`, a następnie zastosuj migracje:

```bash
.venv/bin/alembic upgrade head
.venv/bin/uvicorn backend.app.main:app --reload --port 8000
```

Sprawdź w drugim terminalu:

```bash
curl http://127.0.0.1:8000/health
```

Oczekiwana odpowiedź: `{"status":"ok"}`. Jest to kontrola działania API, nie połączeń z bazą, Supabase ani S3. Dokumentacja lokalna: [Swagger UI](http://127.0.0.1:8000/docs) i [ReDoc](http://127.0.0.1:8000/redoc). W środowisku `production` dokumentacja i `/openapi.json` są wyłączone.

### 4. Skonfiguruj i uruchom panel

Utwórz lokalny, ignorowany przez Git plik `frontend/.env.local` z trzema publicznymi wartościami:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=replace-with-public-anon-key
VITE_API_BASE=http://127.0.0.1:8000
```

W nowym terminalu:

```bash
cd frontend
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

Otwórz **`http://localhost:5173/`**, zarejestruj konto i wykonaj scenariusz UC-01. `--strictPort` zapobiega uruchomieniu panelu na innym porcie niż dopuszczony w CORS. Po zmianie `.env.local` uruchom Vite ponownie.

Wartości `VITE_*` trafiają do kodu przeglądarki. Nie umieszczaj tam `DATABASE_URL`, kluczy AWS, klucza Fernet ani klucza Supabase service-role. Zdalne adresy publicznej konfiguracji muszą używać HTTPS; HTTP jest dopuszczone dla lokalnych adresów loopback. Szczegóły: [konfiguracja środowiska](docs/environment.md).

Panel developerski i lokalna aplikacja AI to osobne aplikacje. Jeśli używasz obu równocześnie, pozostaw aplikację AI na wymaganym przez rozszerzenie `127.0.0.1:5173`, a panel uruchom np. na porcie `5174`, dopisując jego dokładny origin do `PANEL_ALLOWED_ORIGINS` i restartując backend.

## API

Wszystkie poniższe operacje poza `/health` wymagają nagłówka `Authorization: Bearer <access_token>` z poprawnym tokenem Supabase. Backend ustala użytkownika i kancelarię przez `AccessContext`; klient nie wybiera `office_id`.

| Metoda | Endpoint | Działanie |
| --- | --- | --- |
| `GET` | `/health` | Publiczna kontrola działania API |
| `POST` | `/anonymize` | Jeden plik w polu multipart `file`; zwraca metadane wyniku |
| `GET` | `/documents` | Historia dokumentów kancelarii |
| `GET` | `/documents/{document_id}/anonymized-download` | JSON z `download_url`, ważnym przez 300 sekund |
| `POST` | `/documents/{document_id}/deanonymize-response` | Przywrócenie markerów w `response_text` |
| `GET` | `/office-rules` | Lista reguł kancelarii |
| `POST` | `/office-rules` | Utworzenie reguły; odpowiedź `201` |
| `PATCH` | `/office-rules/{rule_id}` | Aktualizacja reguły |
| `DELETE` | `/office-rules/{rule_id}` | Usunięcie reguły; odpowiedź `204` |

Przykład przesłania dokumentu (ustaw lokalnie `ACCESS_TOKEN` na token swojej sesji):

```bash
curl --fail-with-body http://127.0.0.1:8000/anonymize \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F 'file=@./przyklad.pdf;type=application/pdf'
```

Odpowiedź zawiera `document_id`, `original_filename`, `document_format`, `size_bytes` i `status`, a nie sam plik. Aby pobrać wynik, wywołaj endpoint `anonymized-download` dla zwróconego identyfikatora i otwórz otrzymany `download_url`. Dla DOCX użyj MIME `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.

Przykładowe ciało żądania deanonimizacji:

```json
{"response_text": "Proszę o kontakt na [EMAIL_1]."}
```

Tworzenie i aktualizacja reguły wymagają wszystkich czterech pól, również przy `PATCH`:

```json
{
  "kind": "phrase",
  "pattern": "Anna Przykładowa",
  "marker_label": "KLIENT",
  "enabled": true
}
```

Typowe odpowiedzi błędów: `401` — brak lub nieważny token, `403` — niedostępny kontekst kancelarii, `404` — niedostępny wynik lub reguła, `422` — nieprawidłowe dane albo nieobsługiwany dokument.

## Przechowywanie danych

Przepływ danych:

```text
Panel / rozszerzenie → Supabase Auth: logowanie i sesja
Panel / rozszerzenie → FastAPI: dokument + token dostępu
FastAPI → Supabase Auth: weryfikacja użytkownika
FastAPI → PostgreSQL: profil, kancelaria, reguły, metadane, zaszyfrowane mapowanie
FastAPI → prywatny S3: oryginał i zanonimizowany wynik
Panel / rozszerzenie → S3: pobranie wyniku przez krótkotrwały URL
Użytkownik → aplikacja AI: ręczne załączenie sprawdzonego wyniku
```

- Oryginał i wynik pozostają w S3 pod kluczami utworzonymi przez serwer dla kancelarii i dokumentu.
- PostgreSQL nie przechowuje zawartości plików; mapowanie markerów jest szyfrowane Fernet.
- API nie udostępnia pobierania oryginału ani surowego mapowania. Deanonimizacja odbywa się na serwerze i zwraca wyłącznie przetworzony tekst.
- Przeglądarka i rozszerzenie nie otrzymują poświadczeń S3. Pobranie wyniku korzysta z podpisanego URL po kontroli dostępu; link daje czasowy dostęp do tego wyniku.
- Obecna wersja nie ma automatycznego harmonogramu usuwania dokumentów ani przycisku usunięcia dokumentu w panelu. W sprawie retencji i usunięcia danych należy kontaktować się z operatorem usługi.
- Sekrety backendu pozostają w lokalnym `.env` lub magazynie sekretów wdrożenia. Nie trafiają do `VITE_*`, konfiguracji rozszerzenia, argumentów budowania frontendu ani repozytorium.

## Testy i kontrola jakości

### Backend

Z katalogu głównego, po instalacji `backend/requirements-dev.txt`:

```bash
.venv/bin/python -m pytest
```

Bez `TEST_DATABASE_URL` testy wymagające PostgreSQL są pomijane. Testy jednostkowe i API korzystają z kontrolowanego dostawcy Auth oraz atrap S3; nie wymagają poświadczeń AWS, Supabase ani Fly.

Aby uruchomić także integrację z PostgreSQL, utwórz osobną, jednorazową bazę z nazwą zakończoną `_test`:

```bash
TEST_DATABASE_URL='postgresql+psycopg://postgres:postgres@localhost:5432/anonimizator_test' \
  .venv/bin/python -m pytest
```

Fixture odrzuca adresy inne niż PostgreSQL, hosty spoza loopback i nazwy baz bez końcówki `_test`, stosuje migracje Alembic oraz czyści dane testowe. Nie wskazuj bazy aplikacji ani produkcji jako bazy testowej.

### Panel

```bash
cd frontend
npm ci
npm test
npm run lint
npm run build
```

`npm run validate:public-config` dodatkowo sprawdza trzy publiczne zmienne przekazane w środowisku procesu. Skrypt nie wczytuje automatycznie `.env.local`; w CI zmienne są dostarczane przez workflow. Kontrola nie wypisuje ich wartości.

Developerski podgląd stanów komponentów jest dostępny pod `http://localhost:5173/?view=kitchen-sink` wyłącznie w trybie development.

### Rozszerzenie

```bash
cd chrome-extension
npm test
```

Testy rozszerzenia używają runnera Node i atrap Chrome/HTTP, bez sekretów i kont usług zewnętrznych.

## Rozwiązywanie problemów

| Objaw | Co sprawdzić |
| --- | --- |
| „Konfiguracja panelu jest nieprawidłowa” | Wszystkie trzy `VITE_*` w `frontend/.env.local`, poprawność adresów i restart Vite; dla wdrożenia potrzebny jest ponowny build |
| Nie można się zalogować / `401` | Dane logowania, potwierdzenie e-mail oraz zgodność projektu Supabase w backendzie i panelu; zaloguj się ponownie po wygaśnięciu sesji |
| „Nie masz dostępu do zasobów tej kancelarii” / `403` | Połączenie backendu z PostgreSQL i wykonanie migracji; kontekst kancelarii tworzy serwer |
| Błąd połączenia w przeglądarce | Działanie API, `VITE_API_BASE` oraz dokładny origin panelu w `PANEL_ALLOWED_ORIGINS`; `localhost` i `127.0.0.1` to różne originy |
| Dokument nie daje się przetworzyć / `422` | PDF lub DOCX, prawidłowy MIME, niepusty plik do 10 MiB; dla PDF sprawdź warstwę tekstową |
| `/health` działa, ale anonimizacja nie | Konfigurację PostgreSQL, Supabase, S3, klucz Fernet oraz logi backendu; `/health` nie sprawdza usług zewnętrznych |
| Własna reguła nie daje się zapisać | Limity długości, etykietę markera, brak nazwy zarezerwowanej oraz składnię i ograniczenia RE2 |
| Dodana reguła nie zmieniła starego wyniku | Reguły dotyczą nowych przesłań; prześlij dokument ponownie |
| Wygasł link do pliku | Wróć do historii i ponownie kliknij **Pobierz wynik**, aby uzyskać nowy link |
| Deanonimizacja jest niedostępna | Wybór dokumentu `ready` z zapisanym, niepustym mapowaniem i dostępność właściwego klucza Fernet |
| Marker pozostał w odpowiedzi | Zgodność dokumentu źródłowego, pisownię i otoczenie markera; AI musi zachować marker jako osobny element tekstu |
| Rozszerzenie odmawia działania | Aktywna karta musi wskazywać lokalną aplikację AI pod `http://127.0.0.1:5173/` |

## Struktura projektu i wdrożenie

```text
backend/app/          API, autoryzacja, anonimizacja, formaty dokumentów, S3
backend/tests/        Testy jednostkowe, API i integracja z PostgreSQL
frontend/             Panel React/Vite, testy i konfiguracja wdrożenia panelu
chrome-extension/     Rozszerzenie Chrome, testy i materiały publikacji
alembic/              Migracje schematu PostgreSQL
docs/environment.md   Szczegółowy opis konfiguracji środowiska
context/              Wymagania, plany i historia zmian projektu
src/                  Szkielet pakietu Python
```

Punktem wejścia backendu jest `backend.app.main:app`. `Dockerfile` uruchamia Uvicorn na `0.0.0.0:8000`; panel jest budowany osobno i serwowany przez nginx z `frontend/Dockerfile`.

W repozytorium skonfigurowano wdrożenia **Fly.io** uruchamiane przy pushu na `master`:

- [Backend](.github/workflows/fly.yml): aplikacja `anonimizator`, konfiguracja w [fly.toml](fly.toml).
- [Panel](.github/workflows/fly-panel.yml): aplikacja `anonimizator-panel`, konfiguracja w [frontend/fly.toml](frontend/fly.toml).

Workflow korzysta z sekretu GitHub `FLY_API_TOKEN`. Panel otrzymuje publiczne zmienne repozytorium `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` i `VITE_API_BASE`, sprawdza je przed wdrożeniem i przekazuje do buildu. Konfigurację backendu, w tym sekrety bazy, S3 i Fernet, dostarcza się oddzielnie przez magazyn sekretów Fly. W produkcji ustaw `APP_ENVIRONMENT=production` i dokładne originy panelu w CORS. Workflow backendu nie wykonuje migracji — należy uwzględnić je osobno w procesie wydania.

Więcej informacji: [konfiguracja środowiska](docs/environment.md), [wymagania produktu](context/foundation/prd.md) i [roadmapa](context/foundation/roadmap.md). Zakres funkcji opisany w tym README odpowiada bieżącemu kodowi; starsze dokumenty planistyczne mogą opisywać wcześniejsze etapy.

## Licencja

Projekt jest udostępniony na licencji [Apache License 2.0](LICENSE).
