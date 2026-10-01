---
id: 116
title: Fold the plan edit sheets to their name, summary and buttons
status: in-progress
priority: P2
type: feature
---

## Problem

The zone and element edit sheets (`components/plan/PlanSheets.js`,
`EditSheet` / `FeatureEditSheet`) show the dimensions, the hint and the
"Aimantation" block added by 114 all the time. At 390×844 they cover about
60 % of the screen, and on a wide web window most of the height, so little
of the plan is left for dragging corners.

## Why it matters

The edit sheet exists to drag corners; hiding most of the plan behind
settings that change rarely defeats it, on the iPhone first.

## Acceptance criteria

- [x] Mock-up first, validated by the owner (2026-10-01, Herbier v43): new
      artboard PlanEditionPliee (folded); PlanAimantation (unfolded) gets "Plier"
- [x] Owner widened the scope (2026-10-01): the whole sheet folds, not only
      Aimantation; the buttons stay visible
- [x] Folded (the default): name, one line "area · W × L m · active snapping"
      (`snapSummary` in `lib/planSnap.js`), a "Réglages ⌃" button, then the
      buttons; dimensions, hint and Aimantation are hidden
- [x] Unfolded: everything as before, plus a "Plier ⌄" button
- [x] Folded or unfolded is remembered on the device (`plan.editFolded`),
      for zones and elements alike; "Type et nom" on a folded element unfolds it
- [x] Folded, the sheet is shorter than before 114 at 390×844 (name, summary, buttons)
- [x] Jest: `snapSummary`; e2e: "the edit sheet opens folded…"; the tests that
      need the settings unfold them; 110's enlarged viewport is reverted
- [x] `npm run verify` and the plan e2e suite pass
- [ ] Checked on the owner's iPhone

## Notes

Owner request (2026-10-01) after 114's review, then widened with a
screenshot of the web edit sheet.
