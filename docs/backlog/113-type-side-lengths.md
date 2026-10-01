---
id: 113
title: Type the length of a shape's side and stretch the shape
status: in-progress
priority: P2
type: feature
---

## Problem

Zones and garden elements can be resized as a whole (111) or by dragging
corners, but the owner cannot give the exact length of one side, as a
measuring tape gives it in the garden.

## Why it matters

Plans are drawn from measurements taken side by side; typing them is the
fastest way to get an accurate plan.

## Acceptance criteria

- [ ] While tracing a zone and while editing a zone or an element, tapping a
      side's length pill turns it into a field (metres, French decimals);
      "Valider" applies it, "Annuler" restores the shape
- [ ] The shape stretches: the corners lying past the side's midpoint, along
      the side's direction, move by the difference; the others stay, so a
      rectangle stays a rectangle and parallel sides stay parallel; the sheet
      shows the area before and after ("42 m² → 51 m²")
- [ ] While tracing, the last drawn side can be set the same way (its end
      corner moves along the side's direction)
- [ ] With the magnet off, a new or dragged side within 8° of perpendicular
      to its neighbour snaps to 90°; with the magnet on, grid snapping applies
      instead
- [ ] Invalid, zero or out-of-plan lengths are refused in French; works for
      zones and elements, on the phone and the web; matches the PlanCote
      artboard; `npm run verify` and `npm run e2e:web` pass
- [ ] Checked on the owner's iPhone

## Notes

Owner decisions (2026-10-01): stretch rule recommended and accepted; side
lengths typed in tracing and in editing; right-angle help tied to the magnet
being off. Depends on 111 (keyboard) and 112 (zone snapping).
