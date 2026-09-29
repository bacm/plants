---
id: 083
title: Keep the whole photo instead of forcing a square crop
status: done
priority: P1
type: bug
---

## Problem

The plant sheet's "Ajouter" photo (camera and library, `app/plant/[id].js`
`handleAddPhoto`) and the care-log photo (`app/plant/log.js` `pickImage`)
called `expo-image-picker` with `allowsEditing: true`. On iOS that opens the
system's crop editor after every shot or pick, and that editor only offers a
fixed square frame, so every photo lost its sides or its top and bottom.

The mock-up's "Appareil photo" artboard also drew a square guide over the
viewfinder, suggesting a fixed frame the in-app camera (`app/capture.js`)
never applied. That camera already saves the whole shot (only downscaled by
`lib/photoPipeline.js`, aspect ratio kept).

## Why it matters

The owner wants each photo kept whole, at its own proportions: a hedge, a
climbing rose or a whole bed does not fit a square.

## Acceptance criteria

- [x] No `allowsEditing` left in `app/`: the picker returns the photo as
      taken, with no crop step
- [x] The mock-up's camera artboard no longer shows a square frame
- [x] UI-only change with no logic to unit test; to be checked on the iPhone
      at the next device deploy (the crop step only exists on native)
- [x] `npm run verify` passes

## Notes

Mock-up updated 2026-09-29: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks
