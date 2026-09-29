---
id: 075
title: Restyle the camera screen
status: open
priority: P3
type: feature
---

## Problem

`app/capture.js` still uses emoji and the old palette. Split out of 071,
which restyled the sorting and settings screens and gave `PlantStrip` its
dark variant, because the camera cannot be checked on iOS until 062 is fixed.

## Why it matters

The camera is the fastest way to add content; it should feel like part of the
same app.

## Acceptance criteria

- [ ] Translucent round buttons over the viewfinder (close, import,
      "À trier · N")
- [ ] A dark bottom panel with the dark `PlantStrip` (zone chips, round plant
      avatars, the selected one ringed in sprout green), "En fleur" and "Note"
      pills, a white shutter and the last-shot thumbnail
- [ ] Existing behaviour is unchanged
- [ ] `npm run verify` passes; checked on a device or with one targeted
      Maestro flow

## Notes

Mock-up: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks, artboard
"Capture". Depends on 062 (camera cannot be closed on iOS): do it first or
together, since both touch the close button.
