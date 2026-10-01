---
id: 116
title: Collapse the Aimantation settings in the plan edit sheets
status: open
priority: P2
type: feature
---

## Problem

The "Aimantation" section added by 114 to the zone and element edit sheets
(`components/plan/PlanSheets.js`, `SnapBlock`) makes the sheet about 500 px
tall. At 390×844 it covers about 60 % of the screen, so only the top of the
plan is left for dragging corners.

## Why it matters

The edit sheet exists to drag corners; hiding most of the plan behind
settings that change rarely defeats it, on the iPhone first.

## Acceptance criteria

- [ ] The PlanAimantation artboard is updated first (collapsed and expanded
      states) and validated by the owner
- [ ] The section is collapsed by default to a single row: "Aimantation"
      plus a summary of the active targets ("Grille 50 cm · Sommets ·
      Côtés"), and a chevron; tapping it expands the current block
- [ ] Expanded or collapsed is remembered on the device; the settings and
      their behaviour are unchanged
- [ ] Collapsed, the sheet is no taller than before 114 at 390×844
- [ ] `npm run verify` and `npm run e2e:web` pass (the 114 e2e tests expand
      the section where they need it; the enlarged viewport added by 114 in
      "a long press edits an element…" is reverted)
- [ ] Checked on the owner's iPhone

## Notes

Owner request (2026-10-01) after 114's review. Depends on 114.
