---
id: 133
title: Show and edit photo captions in the photo viewer
status: done
priority: P3
type: feature
---

## Problem

A caption can only be typed right after a shot in the camera screen
(`app/capture.js`, `setPhotoCaption`). No screen shows it afterwards, and it
cannot be added or changed later.

## Why it matters

Captions written during a garden walk are lost from view.

## Acceptance criteria

- [x] The plant photo viewer shows the photo's caption under the date when it
      has one
- [x] The viewer has a "Légende" action that edits the caption (empty clears
      it); errors show an alert
- [x] `setPhotoCaption` bumps `updatedAt` so the change syncs (check both
      platforms)
- [x] `npm run verify` and `npm run e2e:web` pass
