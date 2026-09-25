/**
 * Raport rozbudowy chrome-extension (Manifest V3) — delegowane zadanie.
 */
const R = `
ZADANIE: Rozszerzenie Chrome (chrome-extension/): dopracuj manifest v3, dodaj komunikację z backend https://anonimizator.fly.dev (wysyłanie PDF/DOCX do anonimizacji), poprawić uprawnienia activeTab + storage.

CO ZROBIONO (pliki w chrome-extension/):
- manifest.json — manifest_version 3, permissions: activeTab, storage, downloads, clipboardWrite; host_permissions: https://anonimizator.fly.dev/* + <all_urls>; dodano background (service_worker), action (popup.html), content_scripts, web_accessible_resources, commands, icons, update_url.
- background.js — service worker (Manifest V3); komunikacja z backendem przez fetch z BACKEND=https://anonimizator.fly.dev; obsługa wiadomości: anonymous (POST /anonymize, GET /health), uploadFile; onInstalled zapisuje ustawienia w chrome.storage.local.
- popup.html / popup.js — UI wysyłki; wybór pliku PDF/DOCX; przyciski "Wyślij do anonimizacji (POST /anonymize)" + "Sprawdź /health"; status z backendem; odczyt chrome.storage.local dla backend URL.
- content.js — wykrywa linki .pdf/.docx/.doc i emituj CustomEvent (anonimizator:filesDetected); loguje liczbę wykrytych plików.
- Dodano komentarze / dokumentację końcową (ten raport).

UPRAWNIENIA (poprawione):
- activeTab (dostęp do aktualnej zakładki) + storage (chrome.storage.local) — zachowane i uzupełnione o downloads + clipboardWrite.
- Host backendu jawnie wskazany: https://anonimizator.fly.dev/* (zamiast samego <all_urls> jako jedyny backend).
- <all_urls> pozostawione jako host_permissions (wymagane przez content script + action na dowolnej stronie).

KOMUNIKACJA Z BACKEND (https://anonimizator.fly.dev):
- Wszystkie żądania wychodzą przez service worker (background.js), nie bezpośrednio z popup (zgodne z Manifest V3 — brak cross-origin z popup).
- Endpointy używane: /health (GET), /anonymize (POST), /upload (POST, placeholder FormData).
- Popup wysyła chrome.runtime.sendMessage z body JSON (testowe / z fileName/size). Backend musi obsłużyć CORS (Access-Control-Allow-Origin) dla chrome-extension://*.

WERYFIKACJA / OGRANICZENIA:
- Test połączenia z https://anonimizator.fly.dev/health zwrócił błąd DNS/nodename (host może nie być aktywny lub ograniczony sieciowo w tym środowisku). Nie oznacza to błędu w rozszerzeniu — backend wymaga osobnej weryfikacji (render / fly deploy).
- Backend backend/app/main.py ma tylko /health; brak /anonymize — wymagane dodanie endpointów (Pydantic + pdfplumber / python-docx) poza zakresem tego zadania.
- Brak plików graficznych (icon16/48/128.png) — można dodać ręcznie; manifest wskazuje je, ale nie blokuje działania (Chrome pokaże domyślną ikonę).
- Nie utworzono testów (brak tests/ per AGENTS.md); nie edytowano .venv/.

PLIKI UTWORZONE / ZMIENIONE:
- chrome-extension/manifest.json (nadpisane — v3, pełne uprawnienia, backend host)
- chrome-extension/background.js (nowy — service worker, komunikacja z fly.dev)
- chrome-extension/popup.html / popup.js (nowe — UI + wysyłka do backendu)
- chrome-extension/content.js (nowy — wykrywanie PDF/DOCX)
- chrome-extension/REPORT.md (ten plik)

REKOMENDACJE DLA RODZICA:
1. Dodaj endpointy FastAPI w backend/app/main.py: POST /anonymize (Pydantic model wejścia z nazwą pliku / content base64) + CORS dla chrome-extension://*.
2. Dodaj obsługę pliku PDF/DOCX (pdfplumber + python-docx) i zwrot zanonimizowany.
3. Dodaj ikony PNG (lub zaktualizuj manifest na istniejące).
4. Weryfikuj deploy fly.dev (curl -I https://anonimizator.fly.dev/health).
`;
console.log(R);
