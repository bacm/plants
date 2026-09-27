---
id: 040
title: Walk the app on a real iOS or Android device after the refactors
status: open
priority: P1
type: chore
---

## Problem

`lib/db.js` cannot be imported under Jest and `npm run e2e:web` exercises the web
shim, not SQLite. Since 002, 007, 008, 010 and 035 changed native code paths,
the native app has only been proven to bundle, never run.

## Why it matters

A regression in `createPlant`/`updatePlant` (008) or the bloom filtering (007)
on SQLite would reach the user's real garden data.

## Acceptance criteria

On a development build **rebuilt after 039** (React Native 0.83.10, new
reanimated) or Expo Go, with an existing garden database (not a fresh
install, so the migrations run on real data):

- [ ] Existing plants, zones, reminders and photos all still display
- [ ] Create a plant from a search suggestion; every field shows on its detail
- [ ] Edit that plant, clear "date d'ajout", save: the original date is kept (010)
- [ ] "Fait" on a reminder moves its due date and the dashboard updates (002)
- [ ] A plant blooming November to February appears in January on the bloom tab (007)
- [ ] After saving an edit and a care log, "‹ Retour" goes back (035)
- [ ] Enter month 13 and date 2026-02-30: both refused with a message (009)
- [ ] Delete a photo: it disappears immediately (006)
- [ ] Every screen is readable in the dark theme (003)
- [ ] With the search server running, a plant created from a suggestion shows
      its Wikipedia image in the zones list and on its detail screen (012)
- [ ] Any defect becomes its own ticket

## Notes

Back up the device's garden database first: until 020, there is no export.
