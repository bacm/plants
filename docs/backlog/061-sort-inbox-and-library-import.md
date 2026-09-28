---
id: 061
title: Sort unassigned photos and import from the photo library
status: open
priority: P1
type: feature
---

## Problem

056 lets a photo be taken without a plant ("?"), and the owner has many garden
photos already taken with the iPhone camera. Both need a place where photos are
quickly assigned to plants.

## Why it matters

Without it, "?" photos pile up nowhere and existing photos never enter the
garden's history.

## Acceptance criteria

- [ ] An "À trier" screen lists unassigned photos, one at a time, large, with
      the same plant strip as the camera (056) to assign each in one tap; skip
      and delete are available
- [ ] Import from the photo library: several photos at once; each keeps its
      original capture date (EXIF DateTimeOriginal or the asset creation date,
      never the import date) and lands in "À trier"
- [ ] Assigned photos go through `addPhoto` (043) with their original date and
      the 2048 px downscale
- [ ] A badge shows the number of photos to sort (camera screen and dashboard)
- [ ] Unassigned photos are included in backups (020), schema test updated
- [ ] Covered by the iOS simulator flows (library import) and the web e2e test

## Notes

Store unassigned photos in their own table rather than making `photos.plantId`
nullable (that column is NOT NULL; changing it needs a table rebuild).
