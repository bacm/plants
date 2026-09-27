---
id: 014
title: Remove dead files, unused exports and unused styles
status: done
priority: P3
type: chore
---

## Problem

**Dead entry points.** `App.js` and `index.js` are the untouched Expo template.
`package.json` sets `main: expo-router/entry`, so neither is ever loaded. Both are
currently excluded in `eslint.config.js` rather than deleted.

**Exported but never called** from `lib/db.js`: `getDueReminders`,
`getUpcomingReminders`, `getFirstPhotoByPlantId`, `getPlantsByZoneWithPhotos`,
`deleteZone`, `updateZone`. The last two are notable — the code to rename and
delete a zone exists, but no screen offers it.

**Unused styles.** `app/plant/[id].js`: `logNotes`, `logDeleteBtn`,
`lightboxCloseBtn`, `lightboxCloseText`. `app/plant/new.js`: `suggestionsContainer`,
`suggestionsList`, `searchLoader`.

**Unused dependency.** `expo-font` is declared but never imported — the only
mention is a comment at `lib/theme.js:61`.

## Why it matters

Each dead export is a thing a reader has to check before changing the module, and
`App.js` in particular invites someone to edit a file that has no effect. The
eslint ignore entry for it is a workaround for a file that should not exist.

## Acceptance criteria

- [x] `App.js` and `index.js` are deleted, along with their `eslint.config.js`
      ignore entry
- [x] Unused exports are either deleted or wired to the UI that needs them — see
      Notes on the zone ones
- [x] Unused styles are deleted
- [x] `expo-font` is removed from `package.json`, or actually used
- [x] `npm run verify` passes and `npm run bundle` still succeeds

## Notes

`deleteZone` and `updateZone` are a missing feature, not dead code: there is no way
to rename or delete a zone in the app. Split that into a feature ticket rather than
deleting working functions.

`expo-constants`, `expo-linking`, `react-native-screens` and
`react-native-safe-area-context` also have no direct import but are required by
expo-router — do not remove them.

`updateZone`/`deleteZone` are kept for 023. Also removed `getPlantDetails` from
`lib/plantSearch.js` (no caller).
