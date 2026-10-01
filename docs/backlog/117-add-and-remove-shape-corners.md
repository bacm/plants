---
id: 117
title: Add a corner in the middle of a side and remove a corner
status: in-progress
priority: P2
type: feature
---

## Problem

A zone or element outline keeps the corners it was drawn with. To follow a
bend in a bed or a path the owner has to erase the outline and trace it again.

## Why it matters

Real beds are rarely perfect polygons the first time; refining an outline in
place is how the plan gets accurate.

## Acceptance criteria

- [ ] While editing a zone or an element, each side shows a small dashed "+"
      at its midpoint; tapping it adds a corner there, dragging it adds the
      corner where it is released (with the magnet and object snapping of
      112/114, or the right-angle help of 113 with the magnet off)
- [ ] During a corner drag the sheet shows the area before and after
      ("42 m² → 49 m²"); the length pills stay tappable and never cover a "+"
- [ ] A long press on a corner opens "Supprimer ce sommet"; it removes the
      corner, and is disabled when the shape has 3 corners
- [ ] The new outline is saved and synced like any edited outline; works on
      the phone and the web
- [ ] Pure, Jest-tested helpers (insert at a side, remove, midpoints and
      their hit test); matches the PlanSommet and PlanSommetSupprimer
      artboards; `npm run verify` and `npm run e2e:web` pass
- [ ] Checked on the owner's iPhone

## Notes

Owner decisions (2026-10-01): "+" handle at each midpoint, drag or tap;
long press to delete; zones and elements while editing (not while tracing).
