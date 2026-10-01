---
id: 121
title: Snap a dragged corner to a right or flat angle before the grid
status: in-progress
priority: P2
type: feature
---

## Problem

With the magnet on, a dragged zone or element corner went straight to the
grid (`lib/planSnap.js`, `snapPoint`); the right-angle assist of ticket 113
only ran with the magnet off. A corner whose neighbour is off the grid could
never make an exact 90 degree angle.

## Why it matters

The owner reported (2026-10-01) that the grid kept them from getting a right
angle when moving a corner.

## Acceptance criteria

- [x] New chip "Angles 90° / plat" in the Aimantation block, on by default,
      remembered with the other snap settings; hint reads
      "priorité : sommet › côté › angle › grille" (owner choice: other shapes first)
- [x] Within the snap distance of the line square to (or continuing) a
      neighbour's other side, the corner lands on that line; along a
      horizontal or vertical line it still takes the grid step
- [x] Near both neighbours' lines, the corner lands where they cross
- [x] The marker shows "Angle droit" / "Aligné"
- [x] Jest: `snapAngle` and `dragFeatureCorner` cases in `planSnap.test.js`;
      e2e: the angle beats the grid, and the toggle off goes to the grid
- [x] `npm run verify` and the plan e2e suite pass
- [x] Mock-up: PlanAimantation shows the chip and the new hint (Herbier v42)
- [ ] Tried on the iPhone

## Notes

The reach is the snap distance in screen px, not an angle tolerance: an
8 degree tolerance moved the corner tens of cm away from the finger far from
its neighbour, which dropped the drag on web. Tracing a new zone is not
affected (only dragging corners).
