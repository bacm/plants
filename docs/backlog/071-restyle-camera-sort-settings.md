---
id: 071
title: Restyle the camera, photo sorting and settings screens
status: open
priority: P3
type: feature
---

## Problem

`app/capture.js`, `app/sort.js`, `components/PlantStrip.js` and
`app/settings.js` use emoji and the old palette.

## Why it matters

The camera is the fastest way to add content; it should feel like part of the
same app.

## Acceptance criteria

- [ ] Camera: translucent round buttons over the viewfinder (close, import,
      "À trier · N"), a dark bottom panel with the PlantStrip (zone chips,
      round plant avatars, the selected one ringed in sprout green), "En fleur"
      and "Note" pills, a white shutter and the last-shot thumbnail
- [ ] PlantStrip has a dark variant (camera) and a light one (sorting)
- [ ] Sorting: count, "Importer", a large photo with "i / N", the date row
      ("Date inconnue" tag plus an editable date), the green "Classée dans …"
      banner, "Passer" and "Supprimer"
- [ ] Settings: "Sauvegarde de votre jardin" with the Exporter and Importer
      cards
- [ ] Existing behaviour is unchanged
- [ ] `npm run verify` passes; camera changes are checked on a device or with
      one targeted Maestro flow

## Notes

Mock-up: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks, row "Photos et
réglages". Depends on 063, 052. 062 (camera cannot be closed on iOS) should be
fixed first or together.
