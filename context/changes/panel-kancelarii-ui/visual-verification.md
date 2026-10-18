# Wizualna weryfikacja — Panel Kancelarii UI

## Baseline guardu UI (Faza 1)

Uruchomiono z `frontend/`:

```bash
npm run lint:ui-literals
```

Wynik bazowy:

- `src/App.jsx`: 0 kandydatów na niedozwolony literal UI.
- `src/App.css`: 0 kandydatów na niedozwolony literal UI.
- `src/components/ui/`: 0 plików źródłowych i 0 kandydatów (katalog zostanie utworzony w Fazie 3).

Guard skanuje wyłącznie `src/App.jsx`, `src/App.css` i pliki źródłowe w `src/components/ui/`. Celowo nie skanuje `src/index.css`, ponieważ ten plik jest jedynym źródłem surowych wartości tokenów UI.

## Jednorazowe przygotowanie bramki zrzutów

Nie dodawaj pakietu przeglądarkowego ani zależności Playwright do `frontend/package.json`. Zainstaluj CLI globalnie tylko na maszynie wykonującej audyt:

```bash
npm i -g @playwright/cli@latest
playwright-cli install --skills=agents
```

## Polecenia dla zrzutów z Fazy 4

Po wdrożeniu dev-only kitchen sink pod `?view=kitchen-sink`, uruchom Vite w pierwszym terminalu:

```bash
cd frontend
npm run dev -- --host 127.0.0.1
```

W drugim terminalu wykonaj audyt i zapisz artefakty w katalogu zmiany:

```bash
playwright-cli open http://127.0.0.1:5173/?view=kitchen-sink
playwright-cli screenshot --full-page --filename=../context/changes/panel-kancelarii-ui/artifacts/desktop.png
playwright-cli resize 390 844
playwright-cli screenshot --full-page --filename=../context/changes/panel-kancelarii-ui/artifacts/mobile.png
playwright-cli close
```

Docelowe artefakty z Fazy 4:

- `context/changes/panel-kancelarii-ui/artifacts/desktop.png`
- `context/changes/panel-kancelarii-ui/artifacts/mobile.png`

Przed uznaniem bramki należy ręcznie sprawdzić na obu zrzutach: hierarchię uploadu, czytelność tokenów w light/dark mode oraz stany default, hover, focus-visible, disabled, error, empty i loading.

## Faza 4 — wykonana bramka

- `playwright-cli` zainstalowano globalnie; nie dodano zależności browser-test do `frontend/package.json`.
- Kitchen sink jest dostępny wyłącznie lokalnie pod `http://127.0.0.1:5173/?view=kitchen-sink` i renderuje syntheticzny stan default, hover, focus-visible, disabled, error, empty oraz loading.
- Zapisano `artifacts/desktop.png` przy szerokości 1280 px oraz `artifacts/mobile.png` po `resize 390 844`.
- Kontrola dark mode potwierdziła powierzchnię strony, kartę i widoczny focus ring w wariancie ciemnym; zrzut kontrolny został oceniony przed zamknięciem bramki.
- `npm run lint` po zmianie: guard UI 0 kandydatów w 7 plikach; wynik przed zmianą: 0 kandydatów w widoku i jego stylach.
- Regułę dla kolejnych sesji zapisano w `AGENTS.md`, ponieważ repo jest obsługiwane przez Hermes; `CLAUDE.md` pozostaje materiałem lekcyjnym i nie został zmieniony.
