---
id: 118
title: Duplicate a plant to add another of the same species
status: done
priority: P2
type: feature
---

## Problem

Adding a second rose of the same cultivar means typing or searching the whole
species sheet again.

## Why it matters

Gardens hold several plants of one species; copying the sheet makes adding
them a few seconds' work and keeps their data consistent.

## Acceptance criteria

- [x] The plant sheet's bottom bar has a "Dupliquer" button left of "Ajouter
      au journal"
- [x] It opens "Nouvelle plante" prefilled with the species sheet and the
      zone; the name gets " 2" (or the next number when it already ends in
      one); a banner says what is not copied: photos, journal, reminders,
      plan position, planting date and notes
- [x] Nothing is created until "Enregistrer"; the original is unchanged
- [x] The copy rule is a pure, Jest-tested function in `lib/plantFields.js`
      (no field names in the screen); matches the PlanteActions and
      PlanteDupliquer artboards; `npm run verify` and `npm run e2e:web` pass

## Notes

Owner decisions (2026-10-01): species sheet only; prefilled form rather than
an immediate copy.
