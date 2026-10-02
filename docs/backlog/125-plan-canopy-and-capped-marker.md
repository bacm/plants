---
id: 125
title: Draw a big plant as a see-through canopy with a capped marker
status: in-progress
priority: P2
type: feature
---

## Problem

A plant's dot on the plan is drawn at its real size (`dotDiameterPx` in
`lib/gardenPlan.js`) and the whole dot is its touch target (`PlanDot` in
`components/plan/PlanCanvas.js`). A 5 m tree is a 5 m disc at 85 % opacity:
it hides the small plants under it and catches every tap and long press
meant for them. Dots are drawn in database order, so a tree drawn last
covers everything.

## Why it matters

Owner report (2026-10-02): "un arbre de 5m de largeur peut masquer plein de
petites plantes qu'il y a en dessous". The real size must stay visible: it is
how the owner judges spacing.

## Acceptance criteria

- [x] Each placed plant is drawn as two layers: a **canopy** at its real
      size (same `planSizeOf` / `dotDiameterPx` as today) and a **marker**
      whose diameter is the canopy's, capped at 28 px on screen (never under
      the current 12 px minimum)
- [x] The cap is in screen px, so it holds at every zoom; a plant whose
      canopy is under the cap looks exactly as today (one solid dot)
- [x] Canopy: the plant's colour with a light fill (~16 %) and a thin outline;
      marker: solid as today (85 %, white ring)
- [x] Every canopy is drawn under every marker; canopies are ordered largest
      first
- [x] Canopies never take a touch; the marker keeps a touch area of at least
      44 px (`HIT_PX`) for the tap (bubble) and the long press (drag)
- [x] A long press on a zone's empty area under a canopy edits the zone
      (`zoneLongPress` tests the marker radius, not the canopy's)
- [x] The selected plant's ring goes round its marker and its canopy outline
      uses the accent colour; while dragging, the dashed ghost keeps the
      canopy size
- [x] Distance lines (122) still start at the plant's centre; the bubble's
      "Taille sur le plan" still sets the canopy
- [x] Jest: the pure marker-size function (under / over the cap, minimum);
      e2e: a large plant placed over a small one, tapping the small one opens
      its bubble
- [x] Mock-up: the Plan artboard shows a 5 m tree as canopy + marker over
      small plants, validated by the owner before implementing (2026-10-02)
- [x] `npm run verify` and the plan e2e suite pass
- [ ] Tried on the iPhone

## Notes

Approach agreed with the owner on 2026-10-02 (canopy + capped marker rather
than clamping the size, which would lose the scale). 28 px is the drawn
marker; the finger target stays 44 px. Mock-up: Plan artboard, Herbier v46.
