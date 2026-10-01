---
id: 112
title: Snap planting zones to the grid when the magnet is on
status: in-progress
priority: P2
type: feature
---

## Problem

The magnet (109) snaps plants and, since 110, garden elements, but planting
zones are always drawn freely, which the owner noticed on the iPhone. The
magnet button is also hidden while drawing, so it cannot be switched there.

## Why it matters

The owner wants zones aligned on the same 50 cm grid as everything else
when the magnet is on, and free shapes only when it is off.

## Acceptance criteria

- [x] With the magnet on, every zone geometry snaps to 50 cm: corners tapped
      while tracing (the corner and its side lengths show the snapped spot),
      corners dragged in edit mode, the rectangle's position while dragging,
      and a typed resize; with the magnet off all of them stay free
- [x] The magnet button stays at the top of the button column in tracing,
      rectangle and edit modes (zones and elements), as in the artboards
- [x] The tracing instruction and the zone edit hint mention the snapping
      when the magnet is on
- [x] Matches the updated artboards; `npm run verify` and `npm run e2e:web`
      pass
- [ ] Checked on the owner's iPhone

## Notes

Owner decision (2026-10-01): zones snap whenever the magnet is on, free
otherwise. This replaces the "zones are never snapped" rule of 105/109/111.
