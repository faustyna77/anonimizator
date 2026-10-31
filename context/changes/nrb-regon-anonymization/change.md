---
change_id: nrb-regon-anonymization
title: Anonimizacja NRB i poprawna klasyfikacja REGON
status: implemented
created: 2026-10-30
updated: 2026-10-30
archived_at: null
---

## Notes

Scenariusz biznesowy: faktura kancelarii zawiera krajowy 26-cyfrowy numer rachunku (NRB) bez prefiksu `PL` oraz 9-cyfrowy REGON kontrahenta. Obecny silnik nie maskuje poprawnego NRB, a poprawny REGON może zostać oznaczony jako telefon. Zmiana ma wprowadzić walidowane automatyczne wykrywanie tych dwóch identyfikatorów bez ingerencji w Chrome, UI, modele danych ani zewnętrzne usługi.
