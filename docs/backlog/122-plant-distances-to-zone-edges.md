---
id: 122
title: Show a plant's distances to the edges of its zone on the plan
status: in-progress
priority: P2
type: feature
---

## Problem

The plan (`components/plan/PlanCanvas.js`) shows where a plant stands but not
how far it is from the sides of its zone. To place a plant "80 cm from the
border" the owner has to count grid squares.

## Why it matters

Owner request (2026-10-01): "avoir les distances des plantes vers les edges
des zones". It is also the read-out the arrow nudging of ticket 123 needs.

## Acceptance criteria

- [x] When a plant is selected (bubble open), four dashed dimension lines go
      from its centre left, right, up and down to the first side of the zone
      that contains it, each labelled with the distance
- [x] The same lines follow the ghost while a placed or drawer plant is dragged
      (from the snapped point when the magnet is on)
- [x] A plant in no zone measures to the garden border instead
- [x] Concave zones: each line stops at the nearest side in its direction
- [x] Labels read "45 cm" under 1 m and "1,25 m" from 1 m (`formatDistance`)
- [x] Jest: `edgeDistances` and `formatDistance` cases in `gardenPlan.test.js`;
      e2e: selecting a plant shows the four labels with the expected values
- [x] `npm run verify` and the plan e2e suite pass
- [ ] Tried on the iPhone

## Notes

Measured from the plant's centre (its stem), not the edge of its dot. Garden
elements (ticket 110) are not measured to. No mock-up artboard yet: the owner
asked for it to be built directly.
