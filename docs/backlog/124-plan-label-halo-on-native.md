---
id: 124
title: Draw the plan labels' halo under the text on iOS and Android
status: in-progress
priority: P1
type: bug
---

## Problem

The plan's zone names, areas, element labels and distance labels
(`components/plan/PlanCanvas.js`) get a paper-coloured halo through
`paintOrder: 'stroke'`. react-native-svg ignores `paintOrder` on native, so the
3 px stroke is painted over the glyphs.

## Why it matters

Owner report (2026-10-01): on the iPhone the labels and the 122 distances show
as white text.

## Acceptance criteria

- [x] `HaloText` draws a stroked copy under the text on native; web keeps
      `paintOrder` (one text node, so e2e text lookups are unchanged)
- [x] Zone names and areas, element labels and distance labels use it
- [x] `npm run verify` and the plan e2e suite pass
- [ ] Tried on the iPhone

## Notes

No Jest test: the difference is in react-native-svg's native renderer.
