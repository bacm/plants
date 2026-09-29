---
id: 085
title: Warn when a photo being sorted is already on the plant
status: done
priority: P2
type: feature
---

## Problem

"À trier" (`app/sort.js`) files a photo into a plant without checking whether
that plant already has it. Re-importing a batch from the photo library, or
importing a photo already filed earlier, silently creates duplicates in the
plant's history. Nothing in `photos` or `unsorted_photos` records where a
photo came from, and the stored file is re-encoded on import
(`lib/photoPipeline.js`), so the files themselves cannot simply be compared.

## Why it matters

Duplicates clutter the photo history and the year-over-year comparison, and
the owner has to find and delete them by hand.

## Acceptance criteria

- [x] A library import records a fingerprint per photo: the original's EXIF
      date-time to the second (web: the file's `lastModified`), its size in
      bytes and its pixel size. It is kept on the unsorted row, then on the
      photo once filed, and survives a backup and restore
- [x] Filing a photo into a plant that already has one with the same
      fingerprint opens the "Photo déjà présente" sheet (mock-up artboard
      "Photos à trier · doublon"): both photos side by side, then "Remplacer
      l’ancienne" (files the new one, deletes the old one), "Garder les deux"
      (files it as today) and "Annuler" (the photo stays in "À trier")
- [x] When the photo is already on another plant, the sheet says so
      ("Photo déjà classée ailleurs", mock-up artboard "Photos à trier ·
      doublon sur une autre plante") and offers "Garder seulement ici" (files
      it here and removes it from the other plant), "Garder les deux" and
      "Annuler". A match on the target plant wins over one elsewhere
- [x] Photos filed before this change have no fingerprint. For them, same
      date + identical stored file size in bytes counts as a duplicate
      (best effort: it relies on the re-encode being identical, to be
      checked on the iPhone)
- [x] The fingerprint and the matching rules are covered by unit tests; an
      e2e test (web) imports the same photo twice and exercises "Remplacer
      l’ancienne", "Garder les deux" and "Garder seulement ici"
- [x] `npm run verify` passes

## Notes

- Scope is the sort screen only. Photos added from the plant sheet's
  "Ajouter" and shots from the in-app camera get no fingerprint (a camera
  shot is never a duplicate).
- Not a native dialog: `lib/dialogs.js`'s `choose()` resolves `webKey`
  without asking on web, which would silently pick an option.
- Mock-up (2026-09-29): https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks
