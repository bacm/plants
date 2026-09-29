---
id: 071
title: Restyle the photo sorting and settings screens
status: in-progress
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

- [ ] PlantStrip has a dark variant (camera) and a light one (sorting): zone
      chips, round plant avatars, the selected one ringed in sprout green
- [ ] Sorting: count, "Importer", a large photo with "i / N", the date row
      ("Date inconnue" tag plus an editable date), the green "Classée dans …"
      banner, "Passer" and "Supprimer"
- [ ] Settings: "Sauvegarde de votre jardin" with the Exporter and Importer
      cards
- [ ] Existing behaviour is unchanged
- [ ] `npm run verify` and `npm run e2e:web` pass

## Notes

Mock-up: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks, row "Photos et
réglages". Depends on 063, 052.

Split on 2026-09-29: the camera screen itself (`app/capture.js`) moved to 075,
to be done with 062 (camera cannot be closed on iOS). This ticket only passes
`variant="dark"` to the camera's PlantStrip.
