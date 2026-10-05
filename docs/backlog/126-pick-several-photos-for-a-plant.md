---
id: 126
title: Pick several gallery photos at once for a plant
status: done
priority: P2
type: feature
---

## Problem

The plant detail screen's "Ajouter une photo" → "Galerie" (`handleAddPhoto`
in `app/plant/[id].js`) opened the library picker in single-selection mode,
and prefilled the date prompt with today rather than the day the photo was
taken.

## Why it matters

Owner request (2026-10-05): "je veux pouvoir sélectionner plusieurs photos
lorsque j'ajoute ces photos à une plante". Adding a season of photos meant one
round trip per photo, each with a date to retype.

## Acceptance criteria

- [x] The gallery picker allows multiple selection
- [x] With several photos, each keeps its original date
      (`lib/originalPhotoDate.js`) and no date is asked; one date field is
      shown only for the photos without one
- [x] With one photo, the date prompt is prefilled with its original date
- [x] A save failure keeps only the unsaved photos pending, so a retry adds
      no duplicates
- [x] Photos store their `photoFingerprint`, like the sort screen's import
- [x] `e2e/multi-photo.spec.js` adds two photos at once; `npm run verify`
      passes

## Notes

The camera option is unchanged (one shot, dated today).
