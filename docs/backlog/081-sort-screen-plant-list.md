---
id: 081
title: Sort photos into a full-width plant list with complete names
status: done
priority: P1
type: feature
---

## Problem

On the "À trier" screen (`app/sort.js`) the plants to file a photo into are a
horizontal strip of 50px avatars (`components/PlantStrip.js`) whose name is
clipped to one line in a 62px column. Plants of the same kind in one zone are
told apart only by a trailing suffix ("Hortensia Annabelle est 1", "… ouest
1"), which is exactly the part that gets cut.

## Why it matters

The owner cannot tell which plant they are filing a photo into, so sorting is
slow and error-prone.

## Acceptance criteria

- [x] "À trier" lists the zone's plants as full-width rows (thumbnail, full
      name wrapping as needed, chevron), scrollable, with a trailing
      "Nouvelle plante" row; tapping a row files the photo as before
- [x] The photo is shorter (220px) and the "Classée dans …" confirmation sits
      over its bottom edge instead of taking its own row
- [x] The camera's plant strip (`app/capture.js`) keeps its layout but shows
      names on up to 3 lines in an 80px column
- [x] Both match the updated mock-up (artboards "Photos à trier" and
      "Appareil photo")
- [x] `e2e/sort.spec.js` and `e2e/capture.spec.js` pass; UI-only change, no
      unit test
- [x] `npm run verify` passes

## Notes

Mock-up updated 2026-09-29: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks
