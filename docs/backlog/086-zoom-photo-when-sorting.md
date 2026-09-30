---
id: 086
title: Open the photo being sorted full screen and let it zoom
status: done
priority: P1
type: feature
---

## Problem

On "À trier" (`app/sort.js`) the photo being sorted is a 220-point-high
cover-cropped preview: tapping it did nothing, so the owner could neither see
the whole photo nor zoom in to recognise the plant.

The plant detail's lightbox (`app/plant/[id].js`) had a pinch, but it snapped
back to 1× as soon as the fingers lifted and could not pan, so it was no real
zoom either.

## Why it matters

Recognising which plant a photo shows often needs a close look at a leaf or a
flower; a cropped thumbnail is not enough to sort with confidence.

## Acceptance criteria

- [x] Tapping the photo on "À trier" opens it whole on a black full-screen
      viewer with a "Retour" button; an expand badge on the preview hints at it
- [x] In that viewer and in the plant lightbox, pinch zooms (up to 5×) around
      the fingers and stays zoomed, a one-finger drag pans, a double tap
      toggles 2.5× / whole photo — shared `components/ZoomableImage.js`
- [x] `e2e/sort.spec.js` opens and closes the viewer; the gestures
      themselves are native-only and to be checked on the iPhone at the next
      device deploy
- [x] `npm run verify` passes
