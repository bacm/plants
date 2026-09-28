---
id: 068
title: Restyle Bibliothèque, the zone list and the zone detail
status: open
priority: P3
type: feature
---

## Problem

`app/(tabs)/library.js`, `app/(tabs)/zones/index.js` and
`app/(tabs)/zones/[id].js` use the old dark list style.

## Why it matters

These are the two ways into a plant; they should look like the rest of the
redesign.

## Acceptance criteria

- [ ] Bibliothèque: count eyebrow and title, a round "+" to add a plant, a
      rounded search field, filter chips by type, and a 2-column grid of photo
      cards (colour swatch, name, type · zone)
- [ ] Zones: one card per zone (icon, name, description, plant count,
      a strip of plant thumbnails, a context line) and a dashed "Nouvelle zone"
      button
- [ ] Zone detail: back link, name, description, count; "Ajouter une plante"
      as the primary action, "Modifier", and "Supprimer la zone" in danger
      text; plant rows with swatch, name, italic latin name and chevron
- [ ] Zone icons show as icons from the 052 set, mapped from the stored emoji
      in `lib/enums.js` (no data migration)
- [ ] Existing behaviour is unchanged
- [ ] `npm run verify` and `npm run e2e:web` pass

## Notes

Mock-up: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks, artboards
"Bibliothèque", "Zones", "Détail d'une zone". Depends on 063, 064, 052.

053 asks for at least 6 plants per Bibliothèque screen; the mock-up's grid
shows about 4. The owner must choose between the two before this starts.
