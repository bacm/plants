---
id: 110
title: Draw garden features that exist only on the plan
status: in-progress
priority: P2
type: feature
---

## Problem

The plan (106/107) only knows planting zones. The owner also wants to draw
the house, a shed, the terrace, paths, a pond or a fence — things that are not
zones, never hold plants and should not appear in the Zones list.

## Why it matters

Without them the plan has no landmarks: plants float on an empty grid and the
garden is hard to recognise.

## Acceptance criteria

- [x] A new synced table `plan_features` (id, `kind`, `label`, `polygon` in
      integer cm, updatedAt, deletedAt) wired like `garden_plan`: backups
      (optional table for older backups), `server/sync_schema.json`, web
      store, first-sync counts; db functions with the same names in
      `lib/db.js` and `lib/db.web.js`
- [x] Kinds and their French labels live in `lib/enums.js` (Maison, Abri,
      Terrasse, Allée, Bassin, Clôture, Autre — no Pelouse); each kind has its
      own look from `lib/theme.js`
- [x] The plan header button "Ajouter" offers "Une zone de plantes" (the 107
      flow) or "Un élément du jardin"
- [x] An element is created from a type, an optional name and width × length,
      placed then dragged; its corners are then dragged by finger; with the
      magnet on, its position and corners snap to the 50 cm grid
- [x] Editing an element: corner handles, area, "Type et nom", "Supprimer"
      (confirmed), "Terminer"
- [x] A plant cannot be dropped on an element: the drop is refused, the plant
      returns to its previous spot (or stays in "À placer") and a red banner
      says "Impossible de poser une plante sur <Élément>"
- [x] Elements never appear in the Zones list and never change a plant's zone
- [ ] Matches the artboards PlanAjouter, PlanElement, PlanElementModifier and
      PlanElements; `npm run verify`, server pytest and `npm run e2e:web` pass;
      the server deploy accepts the new table

## Notes

Owner decisions (2026-10-01): preset type + optional free name; rectangle by
dimensions then corners by finger; snapped with the plants' magnet; plants
refused on every element; no "Pelouse" type (the plan's background is the
lawn). Zone corners stay free (105/109).
