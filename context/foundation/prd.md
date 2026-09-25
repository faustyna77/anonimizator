---
project: anonymizer-prawniczy
product_type: api
target_scale:
  users: small
  organizations: 10
timeline_budget:
  mvp_weeks: 6
---

# Product Requirements Document — Anonymizer Prawniczy

## 1. Overview
Rozszerzenie Chrome dla prawników i backend API w chmurze, który anonimizuje dane poufne (PESEL, NIP, e-mail, telefon, IBAN) w dokumentach PDF/DOCX przed wysłaniem ich do webowych aplikacji AI. Rozszerzenie jest klientem backendu; rozwiązanie umożliwia późniejszy dostęp do zanonimizowanych danych i pełną kontrolę nad regułami.

## 2. Użytkownik docelowy
Prawnik z doświadczeniem z AI, codziennie anonimizujący ręcznie dokumenty przed wysłaniem do narzędzi AI. Potrzebuje szybkości, kontroli i późniejszego dostępu do zanonimizowanych danych.

## 3. Problem
Ręczne anonimizowanie jest czasochłonne, ryzykowne (pominięcie danych) i pozbawia kontroli nad tym, co model zobaczy. Istotne dla kancelarii ze względu na poufność.

## 4. Proponowane rozwiązanie (MVP)
### 4.1 Rozszerzenie Chrome
Działa na webowych aplikacjach AI (w tym aplikacji użytkownika na localhost:3000).
### 4.2 Anonimizacja w backendzie chmurowym
Wykrywa PESEL, NIP, e-mail, telefon, IBAN; zamienia je na znaczniki [PESEL_1], [IMIE_1]. Dokument jest przesyłany do backendu, który wykonuje anonimizację.
### 4.3 Panel reguł i odwracanie
CRUD reguł kancelarii. Odwracanie znaczników w odpowiedzi modelu.

## 5. Poza zakresem
Inne przeglądarki (Firefox, Safari), aplikacje natywne, inne języki niż polski, automatyczne wykrywanie imion i nazwisk w v1.

## 6. Założenia i ograniczenia
Anonimizacja jest wykonywana w backendzie wdrożonym w chmurze, dlatego dokumenty w postaci niezanonimizowanej są przesyłane do usługi. MVP wymaga Chrome; backend API zostanie wdrożony na Renderze, zarządzany PostgreSQL będzie działać w Supabase w regionie UE, a panel kancelarii jako frontend React zostanie wdrożony na Cloudflare Pages. Pierwszy pilotaż obejmuje 1–10 kancelarii, a celem MVP jest 4 listopada 2026.
