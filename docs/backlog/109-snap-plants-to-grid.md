---
id: 109
title: Snap plants to a 50 cm grid on the garden plan
status: in-progress
priority: P2
type: feature
---

## Problem

Plants on the plan (106) land exactly where the finger or the mouse is
released, so a row of plants never lines up and two plants meant to sit
side by side end up a few centimetres apart.

## Why it matters

The owner wants tidy, measured placements, with the option to place freely
when a plant really sits between two grid points.

## Acceptance criteria

- [ ] With snapping on, a plant dropped on the plan (moved, or dragged from
      "À placer") lands on the nearest 50 cm grid point, clamped inside the
      garden; the ghost while dragging already shows that snapped spot
- [ ] A magnet button at the top of the plan's button column turns snapping
      on and off; it is on by default and the choice is remembered on the
      device (not synced)
- [ ] Zone corners and rectangles are never snapped (owner decision)
- [ ] With snapping off, plants are placed freely as before
- [ ] Matches the updated Plan artboard; `npm run verify` and
      `npm run e2e:web` pass

## Notes

Owner decision (2026-10-01): snap plants only, to a 50 cm grid, toggle on by
default and remembered per device. This reverses, for plants only, the "no
snapping" decision of 105.
