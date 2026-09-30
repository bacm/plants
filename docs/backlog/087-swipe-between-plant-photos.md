---
id: 087
title: Swipe between a plant's photos in the lightbox
status: done
priority: P2
type: feature
---

## Problem

The plant detail's lightbox (`app/plant/[id].js`) showed one photo: to see
the next, the owner had to close it and tap another thumbnail.

## Why it matters

Following a plant through the season means flicking through its photos in a
row; closing and reopening the viewer for each one breaks that.

## Acceptance criteria

- [x] In the lightbox, a horizontal swipe goes to the previous / next photo of
      the plant (newest first, same order as the grid); the date line shows
      "n / total" — `components/PhotoPager.js`
- [x] While a photo is zoomed, a drag pans it instead of changing photo
- [x] "Modifier la date" and "Déplacer" act on the photo shown; after a date
      edit re-sorts the photos, the lightbox stays on the same photo
- [x] `e2e/photo-swipe.spec.js` swipes from the first photo to the second;
      touch swiping and the zoom lock to be checked on the iPhone
- [x] `npm run verify` passes
