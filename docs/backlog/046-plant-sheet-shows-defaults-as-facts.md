---
id: 046
title: Plant sheet presents default values as if the user entered them
status: done
priority: P2
type: bug
---

## Problem

A plant created with only a name ("Mystère") shows "Mi-ombre", "Moyen",
"Limoneux", "Neutre" on its detail screen: `lib/plantFields.js` stores enum
defaults (`dbDefault`) that the user never chose, and the screen cannot tell
them apart from real data. The "Fiche technique" tiles have no labels (a
thermometer over "—", a leaf over "—"), and "Mi-ombre" uses a sun icon.

## Why it matters

The app states wrong facts about the user's plants, and the tiles cannot be
read without guessing what each icon means.

## Acceptance criteria

- [x] An enum the user did not choose is stored as unknown and shown as unknown
      (or hidden), never as a default value; the form still offers a choice
- [x] Existing rows: values equal to the old defaults are NOT rewritten (they may
      be real choices) — the change applies to new plants only, and this is
      stated in the ticket when closed
- [x] Every tile has a text label ("Exposition", "Arrosage", "Floraison",
      "Rusticité", "Feuillage", "Couleur"); empty tiles are hidden or grouped
      under "À compléter" with a link to edit
- [x] Each exposure value has its own icon
- [x] `plantFields.test.js` covers the unknown state; backups (020) round-trip it

## Notes

`type`, `sun` and `water` are `NOT NULL` in the `plants` table; storing unknown
needs either a sentinel value (e.g. `'unknown'`, added to `lib/enums.js`) or a
table rebuild migration. Prefer the sentinel. Ties into 053 (visual redesign).

Unchosen enums store `'unknown'` (label "Non renseigné") for new plants only;
existing rows are untouched, since an old "Mi-ombre" may be a real choice. Plant
search no longer invents defaults either. Tiles come from `lib/plantSheet.js`.
