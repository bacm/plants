---
id: 115
title: Turn care logs into a plant journal with measurements
status: open
priority: P2
type: feature
---

## Problem

The plant sheet only records care ("Enregistrer un soin"). The owner wants to
note a plant's current size, which is not care, and to let the plan use it:
today the plan's dot size is either a manual setting (108) or a fixed size.

## Why it matters

Measured sizes make the plan reflect the garden as it is, and their history
shows how each plant grows.

## Acceptance criteria

- [ ] Wording: the button reads "Ajouter au journal", the screen "Nouvelle
      entrée", the section "Journal" (empty: no mention of "soin" only); a
      Soin | Observation switch on the entry screen; existing care entries
      are unchanged
- [ ] Observation offers Mesure (width and height in cm, at least one, both
      positive integers), Note (text required) and En fleur (also recorded as
      a bloom observation, like the "en fleur" photos); labels live in
      `lib/enums.js`
- [ ] Journal entries gain `widthCm` / `heightCm` (synced, in backups as
      optional columns, in `server/sync_schema.json`); the timeline shows
      "Mesuré · 120 × 90 cm", notes and "En fleur" entries
- [ ] The Actions tab shows a "Taille" card: the latest measurement with its
      date and a small growth curve (width solid, height dotted) when there
      are at least two measurements
- [ ] The plan uses the latest measured width for a plant's dot unless its
      size was set by hand in the bubble; a new measurement with a width
      clears that manual size; the bubble says where the size comes from
      ("mesurée le 12 sept." or "réglée sur le plan")
- [ ] Matches the artboards Soin, JournalMesure, PlanteActions and PlanBulle;
      `npm run verify`, server pytest and `npm run e2e:web` pass; the server
      deploy accepts the new columns
- [ ] Checked on the owner's iPhone

## Notes

Owner decisions (2026-10-01): "Ajouter au journal" vocabulary; Observation =
Mesure, Note, En fleur; plan size = latest measurement unless set manually
until the next measurement; growth curve in the sheet.
