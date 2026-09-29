---
id: 070
title: Restyle the care log and reminder screens
status: done
priority: P3
type: feature
---

## Problem

`app/plant/log.js` and `app/plant/reminders.js` use the old form style.

## Why it matters

Logging a care is a frequent, quick action; it should take one glance.

## Acceptance criteria

- [x] Care log: the plant name as subtitle, care types as a grid of icon
      tiles, the date with "Aujourd'hui" / "Hier" chips, notes, a dashed
      "Ajouter une photo" tile, a sticky "Enregistrer" button
- [x] Reminders: suggestions on soft-green cards with "Ajouter", a "Nouveau
      rappel" card (kind chips, every N days, next due date), then the saved
      reminders with "Fait" and a labelled delete button
- [x] Both use the 065 components
- [x] Existing behaviour is unchanged
- [x] `npm run verify` and `npm run e2e:web` pass

## Notes

Mock-up: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks, artboards
"Enregistrer un soin", "Rappels". Depends on 063, 065.
