---
id: 114
title: Snap shape corners to other shapes, with snapping settings
status: in-progress
priority: P2
type: feature
---

## Problem

With the magnet (109/112), corners snap only to the grid. Two beds cannot
be placed edge to edge, nor a corner put exactly on another shape's corner,
without gaps or overlaps.

## Why it matters

A garden plan is a mosaic of touching shapes (bed against the house, path
along the terrace); snapping to neighbours is what makes it fit.

## Acceptance criteria

- [x] With the magnet on, a zone or element corner (tracing, dragging, resize;
      a typed side length stays exact, as in 113) snaps to the enabled targets within the attraction
      distance, in priority order: another shape's corner (or the garden's
      corner) › the nearest point on another shape's side (or the garden's
      border) › the grid
- [x] A marker shows the chosen target while dragging or tracing ("Sommet",
      "Côté", "Bord", nothing for the grid)
- [x] The zone and element edit sheets have an "Aimantation" section: toggles
      Grille (with its step: 10, 25, 50 cm or 1 m), Sommets, Côtés, Bord du
      jardin, and a distance Petite / Moyenne (12 px) / Grande, measured on
      screen whatever the zoom; remembered on the device; applies to every
      zone and element corner
- [x] The magnet button stays the master switch; plants keep snapping to the
      grid only
- [x] The snapping maths is pure and Jest-tested (priority, distance, the
      shape being edited never snaps to itself); matches the PlanAimantation
      artboard; `npm run verify` and `npm run e2e:web` pass
- [ ] Checked on the owner's iPhone

## Notes

Owner decisions (2026-10-01): settings live in the edit sheet; all four
targets, each toggleable; priority corner › side › grid; adjustable
distance, 12 px by default. Depends on 112 and 113.
