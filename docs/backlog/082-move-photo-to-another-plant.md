---
id: 082
title: Move a photo to another plant from the photo viewer
status: done
priority: P1
type: feature
---

## Problem

Once a photo is filed into a plant (from "À trier", the camera, or the Photos
tab) there is no way to change which plant it belongs to. The lightbox in
`app/plant/[id].js` (the `<Modal visible={!!selectedPhoto}>`) only offers
"Modifier la date" (078); `lib/db.js` has `updatePhotoDate` but nothing that
changes `photos.plantId`. A photo filed into the wrong plant while sorting
has to be deleted and re-imported.

## Why it matters

Sorting mistakes are easy when several plants of the same kind share a zone
("Hortensia Annabelle est 1" / "est 2"). Today the only fix loses the photo
or forces a re-import from the photo library.

## Acceptance criteria

- [x] The photo viewer shows two actions under the photo: "Modifier la date"
      and "Déplacer" (mock-up artboard "Photo · visionneuse")
- [x] "Déplacer" opens a bottom sheet "Déplacer la photo" with the zone chips
      and the full-width plant list from 081 (`ZoneChips`, `PlantPickList`);
      it opens on the photo's current zone, and the current plant is shown
      dimmed with an "Actuelle" tag and cannot be picked (artboard "Photo ·
      déplacer vers une autre plante")
- [x] Picking a plant moves the photo: it leaves this plant's gallery, shows
      in the target's, keeps its file and date; the viewer closes and a
      confirmation names the target plant
- [x] A new `movePhoto(id, plantId)` in `lib/db.js` and `lib/db.web.js`
      (parity test) updates `plantId` and clears `careLogId` (the care entry
      belongs to the old plant); it throws when the photo is missing, and the
      screen shows the error with `Alert.alert('Erreur', …)` (CLAUDE.md rule 6)
- [x] An e2e step (web) files a photo into plant A, moves it to plant B and
      checks it is on B and no longer on A
- [x] `npm run verify` passes

## Notes

- Depends on 081 for `ZoneChips` and `PlantPickList`.
- Photo files are named by photo id (`photoFileName(id, uri)`), not by plant,
  so a move is a single `UPDATE`; no file is copied or renamed.
- No "+ Nouvelle plante" row in this sheet: a move goes to an existing plant.
- Mock-up (2026-09-29): https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks
