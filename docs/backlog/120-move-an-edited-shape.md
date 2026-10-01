---
id: 120
title: Move a whole zone or element in edit mode with a long press
status: in-progress
priority: P2
type: feature
---

## Problem

In edit mode (`kind: 'edit'` or `'feature'`), `components/plan/DraftLayer.js`
only gave the corners and the "+" handles a gesture; the whole-shape drag
existed only for a new rectangle. A garden element (Maison, Abri, Terrasse…)
or a zone could not be moved once placed — only reshaped corner by corner.

## Why it matters

The owner reported (2026-10-01) that an element sitting at the wrong place
on the plan could not be moved.

## Acceptance criteria

- [x] In edit mode, a long press (450 ms, as for a plant) inside the outline
      then a drag moves the whole shape; the magnet snaps it as for a rectangle
- [x] A press in the bounding box but outside a concave outline moves nothing
- [ ] A short drag on the shape still pans the plan (to check on the iPhone); corners and "+" keep their gestures (117 e2e pass)
- [x] e2e: "an element: a long press inside moves the whole shape, and it is saved"
- [x] `npm run verify` and `npm run e2e:web` pass
- [ ] Tried on the iPhone

## Notes

No mock-up change: the gesture is the one plants already use.
