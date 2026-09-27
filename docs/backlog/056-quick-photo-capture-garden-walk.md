---
id: 056
title: Capture and file plant photos in two gestures during a garden walk
status: open
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

- [ ] A capture action is reachable in one tap from the dashboard (and from
      every tab), opening the camera directly
- [ ] After the shot, the user picks the plant from a list ordered by
      relevance: plants of the zone used last, then recently photographed, with
      search and "Nouvelle plante"; the date is the capture time — no date form
- [ ] Optional one-tap tags on the same sheet: "En fleur" (feeds 029), a short
      note, "Problème"; saving returns to the camera for the next plant
- [ ] "Tour du jardin" mode: pick a zone, then go plant by plant through it
      (photo, tag, next), with a skip
- [ ] Import from the photo library: select several photos at once; each keeps
      its original capture date (EXIF / asset creation date, not the import
      date); assign them to plants one after another on a single screen, with
      the plant list above re-used
- [ ] Photos go through `addPhoto` (app-owned storage, 043); no photo is lost if
      the user leaves mid-way — already assigned ones are saved
- [ ] Flows covered by Maestro (055) using the simulator photo library, and by
      the web e2e test for import

## Notes

The camera cannot be exercised in the simulator; library import can. Needs
`expo-media-library` or the picker's `exif`/`assetId` to get original dates —
check what `expo-image-picker` 55 returns before adding a dependency. Later:
an iOS home-screen quick action "Photo rapide". Pairs with 058 (home screen)
and 029 (observed bloom).
