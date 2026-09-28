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
- [ ] Photos taken before 043 still display after the first launch (migrated
      into the app's `photos/` folder); a new photo survives clearing the app's
      cache; deleting a photo works (043)
- [ ] Réglages: export shares a file; importing it on a second device (or after
      reinstalling) restores plants, zones, reminders, logs and photos (020)
- [ ] "Ce mois-ci au jardin" lists this month's tasks; ticking one logs care and
      removes it; a suggested yearly reminder can be added (022, 031)
- [ ] With 4 grouped task cards, "Ce mois-ci au jardin" still starts on the
      first screen (045)
- [ ] Any defect becomes its own ticket

## Notes

Back up the device's garden database first: until 020, there is no export.

Simulator run (2026-09-27, iPhone 17 / iOS 26, Expo Go, Maestro — see 055): on a
fresh install, all of these passed natively: edit keeps "date d'ajout" (010),
"Fait" advances the due date (002), back after save (035), month/date validation
(009), a photo survives a relaunch and deletes (006, 043), export opens the share
sheet (020), zone deletion keeps plants (023), a monthly task ticks off (031).
Still to do on a real device: the migration of an existing database and photos,
the camera, Android, and importing a backup.
