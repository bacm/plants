---
id: 061
title: Sort unassigned photos and import from the photo library
status: done
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

- [x] An "À trier" screen lists unassigned photos, one at a time, large, with
      the same plant strip as the camera (056) to assign each in one tap; skip
      and delete are available
- [x] Import from the photo library: several photos at once; each keeps its
      original capture date (EXIF DateTimeOriginal or the asset creation date,
      never the import date) and lands in "À trier"
- [x] Assigned photos go through `addPhoto` (043) with their original date and
      the 2048 px downscale
- [x] A badge shows the number of photos to sort (camera screen and dashboard)
- [x] Unassigned photos are included in backups (020), schema test updated
- [x] Covered by ~~the iOS simulator flows (library import) and~~ the web e2e
      test — the iOS flow is written but disabled until 062

## Notes

Store unassigned photos in their own table rather than making `photos.plantId`
nullable (that column is NOT NULL; changing it needs a table rebuild).

Original dates: EXIF DateTimeOriginal (then Digitized, DateTime) parsed without
a timezone shift; web has no EXIF from the picker, so it uses the file's
lastModified. When no date is found the photo is stored with `dateUnknown` and
the sort screen asks for a date before filing it — never a silent default.
Import is always reachable from the camera's "Galerie" button.
