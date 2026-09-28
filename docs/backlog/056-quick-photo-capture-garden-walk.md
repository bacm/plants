---
id: 056
title: Capture and file plant photos in two gestures during a garden walk
status: done
priority: P1
type: feature
---

## Problem

Adding a photo today means Bibliothèque (or a zone) → the plant → Photos tab →
"+ Ajouter" → camera or gallery → a date modal: five screens and a form, for
the most frequent thing the owner does in the garden. The owner reports taking
many photos while walking around the garden, often with the iPhone camera, and
finding it too tedious to file them.

## Why it matters

Photos are the heart of the app's long-term value (history, blooms, timelapse,
memories). If filing one takes five screens, it does not happen, and the app
stops being opened once the plants are entered.

## Acceptance criteria

Decisions (owner, 2026-09-28): in-app camera that stays open (`expo-camera`),
plant chosen first with a "?" fallback, a central camera button in the tab bar,
photos downscaled to 2048 px on the long side.

- [x] A camera button in the middle of the tab bar opens a full-screen in-app
      camera from any tab, in one tap
- [x] The camera stays open between shots; a strip at the bottom lists the
      plants of the current zone (zone switcher at the top, last zone
      remembered), with "?" for "à trier" and "+" for a new plant
- [x] Each shot is saved at once to the selected plant with the capture time —
      no form, no date modal — downscaled to 2048 px, through `addPhoto` (043)
- [x] One-tap "En fleur" records a bloom observation for that plant and day
      (the storage part of 029); a short note can be attached to the last shot
- [x] Feedback per shot: haptic, a counter ("Lavande · 3"), and undo of the
      last shot
- [x] Camera permission denied: a clear message and a way to open the settings
- [x] Web: works with the browser camera; the e2e test shoots with a fake
      camera stream and finds the photo on the plant
- [x] iOS simulator flow (055) covers everything but the shutter; ~~the shutter
      is checked on a device~~ — moved to 040

The "à trier" screen and importing from the photo library move to 061.

## Notes

The camera cannot be exercised in the simulator; library import can. Needs
`expo-media-library` or the picker's `exif`/`assetId` to get original dates —
check what `expo-image-picker` 55 returns before adding a dependency. Later:
an iOS home-screen quick action "Photo rapide". Pairs with 058 (home screen)
and 029 (observed bloom).

In-app camera (`app/capture.js`, `expo-camera`) opened from a central tab
button; shots are downscaled to 2048 px and saved at once through `addPhoto`, or
into the new `unsorted_photos` table for "?" (sorted by 061). "En fleur" writes
`bloom_observations` (the storage part of 029); notes go to `photos.caption`.
All three are in backups (optional on import, format still v1). Web e2e shoots
with a fake camera; iOS flow 09 covers the screen without the shutter.
