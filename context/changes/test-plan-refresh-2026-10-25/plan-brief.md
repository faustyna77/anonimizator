# Kontrakt publicznej konfiguracji panelu — Plan Brief

> Full plan: `context/changes/test-plan-refresh-2026-10-25/plan.md`
> Research: `context/changes/test-plan-refresh-2026-10-25/research.md`

## What & Why

Panel kancelarii wymaga trzech publicznych ustawień wbudowywanych podczas builda: URL Supabase, publicznego klucza Supabase i API base. Obecny build może się udać przy pustej lub błędnej wartości, a błąd pojawia się dopiero przy logowaniu albo po żądaniu produktu. Plan ustanawia wspólny kontrakt konfiguracji i zatrzymuje wadliwy release jeszcze przed Fly deployem.

## Starting Point

GitHub Actions przekazuje trzy GitHub Variables jako Docker build arguments, po czym Vite tworzy statyczny bundle. Auth sprawdza jedynie dwa ustawienia przy mountowaniu aplikacji, a API ma niejawny fallback. Vitest jest już skonfigurowany — bieżąca bramka to 39 przechodzących testów.

## Desired End State

Login i żądania produktu korzystają z jednego zaakceptowanego zestawu publicznych wartości. Zdalne endpointy wymagają HTTPS, lokalny dev może użyć HTTP wyłącznie dla loopback. Pusty albo syntaktycznie niedozwolony zestaw nie umożliwia użycia panelu i nie jest wysyłany do Fly.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Ryzyko biznesowe | Wydany, lecz nieużywalny panel | Blokuje kancelarię przed podstawowym przepływem logowania/anonimizacji. | Research |
| Test layer | Czysty Vitest contract test | Wykrywa ryzyko bez DOM, sieci, Docker ani E2E. | Research |
| URL policy | HTTPS lub HTTP wyłącznie na loopback | Chroni zdalny release bez blokowania lokalnego API/Supabase. | Plan |
| Release protection | Resolver testowany + preflight workflow | Unit test chroni zachowanie, workflow chroni realne GitHub Variables. | Plan |
| CI setup | Node + `npm ci` w istniejącym jobie deployu | Jest konieczne, aby workflow wykonał skrypt Node; nie dodaje usługi CI. | Plan |

## Scope

**In scope:**
- Pure resolver dla trzech `VITE_*` ustawień, używany przez auth i API.
- Testy Vitest konfiguracji oraz wykonywalny Node preflight.
- Wczesna bramka GitHub Actions przed `flyctl deploy`.
- Dokumentacja publicznych wartości i polityki HTTPS/loopback.

**Out of scope:**
- E2E, browser smoke i połączenia z prawdziwymi usługami.
- Weryfikacja dostępności lub semantycznej poprawności zdalnych hostów.
- Sekrety, `.env`, backend i Chrome extension.

## Architecture / Approach

`import.meta.env` i `process.env` są adapterami wejścia do jednego resolvera, nie źródłami oddzielnych reguł. Resolver zwraca kompletną konfigurację tylko po walidacji; auth i API nie odczytują już zmiennych bezpośrednio. Skrypt Node przekazuje do niego trzy publiczne wartości z workflow, dzięki czemu local test i release używają tej samej polityki.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Kontrakt konfiguracji panelu | Testowany resolver w użyciu auth/API bez fallbacku | Panel ładuje się, ale login lub API jest nieużywalne. |
| 2. Bramka release’u konfiguracji | Node preflight, workflow order i dokumentacja | Pusta/błędna GitHub Variable dochodzi do Fly builda. |

**Prerequisites:** Node, npm i Vitest są dostępne; `frontend/npm test` zostało zweryfikowane (39 passed). Faza 2 dodaje tylko konieczny Node setup do istniejącego joba GitHub Actions.
**Estimated effort:** ~1–2 krótkie sesje w 2 fazach.

## Open Risks & Assumptions

- Preflight potwierdza format i kompletność, nie to, czy zdalny URL wskazuje właściwą usługę — do tego pozostaje kontrolowany deploy smoke.
- Publiczny klucz Supabase jest przeznaczony dla frontendu, ale workflow i błędy nie mogą wypisywać jego wartości.
- Nie ma osobnej fazy setupu testów, bo istniejący Vitest spełnia potrzebę testowego kontraktu; infrastruktura Node wymagana przez workflow należy do Fazy 2.

## Success Criteria (Summary)

- Niekompletne lub niedozwolone wartości nie pozwalają utworzyć konfiguracji dla logowania ani produktu.
- Vitest pokrywa HTTPS, loopback HTTP, brak każdej wartości i niedozwolone URL-e.
- GitHub Actions wykonuje preflight przed `flyctl deploy`, nie logując wartości konfiguracji.
