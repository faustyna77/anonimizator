# Kontrakt tokenów Panelu Kancelarii

## Źródło wartości

`frontend/src/index.css` jest jedynym źródłem surowych wartości kolorów dla Panelu Kancelarii. Definicje light mode znajdują się w `:root` (linie 1–39), a odpowiadające im nadpisania dark mode w `@media (prefers-color-scheme: dark)` (linie 41–67). Style widoku używają wyłącznie ról przez `var(...)`.

## Role

| Rola | Zastosowanie | Źródło light | Źródło dark |
| --- | --- | --- | --- |
| `--surface-page`, `--surface-card`, `--surface-subtle` | tło strony, karta i powierzchnia pomocnicza | `index.css:2-4` | `index.css:43-45` |
| `--text-primary`, `--text-secondary` | treść podstawowa i pomocnicza | `index.css:5-6` | `index.css:46-47` |
| `--border-subtle` | obramowania kontrolek, kart i list | `index.css:7` | `index.css:48` |
| `--action-primary`, `--action-primary-hover`, `--action-primary-text` | podstawowa akcja i jej stan hover | `index.css:8-10` | `index.css:49-51` |
| `--action-secondary`, `--action-secondary-hover`, `--action-secondary-text` | pomocnicza akcja i jej stan hover | `index.css:11-13` | `index.css:52-54` |
| `--action-destructive`, `--action-destructive-hover`, `--action-destructive-text` | akcja destrukcyjna i jej stan hover | `index.css:14-16` | `index.css:55-57` |
| `--focus-ring` | `:focus-visible` wszystkich kontrolek | `index.css:17` | `index.css:58` |
| `--disabled-surface`, `--disabled-text` | natywny stan `disabled` | `index.css:18-19` | `index.css:59-60` |
| `--status-info`, `--status-info-surface` | komunikat `role="status"` | `index.css:20-21` | `index.css:61-62` |
| `--status-error`, `--status-error-surface` | komunikat `role="alert"` | `index.css:22-23` | `index.css:63-64` |
| `--shadow-panel` | separacja powierzchni karty | `index.css:24` | `index.css:65` |

## Kontrola dark mode

Wynik kontroli implementacyjnej: zachowany. Każda rola kolorystyczna z tabeli ma własne nadpisanie w bloku `prefers-color-scheme: dark`; globalne style kontrolek, fokusu, disabled oraz komunikatów statusu odwołują się do tych samych nazw ról (`index.css:84-132`). Ręczna ocena czytelności kontrastu w obu preferencjach motywu pozostaje krokiem 2.3 planu.
