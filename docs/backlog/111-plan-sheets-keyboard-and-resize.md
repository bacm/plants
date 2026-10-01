---
id: 111
title: Keep plan inputs above the keyboard and resize a drawn shape
status: in-progress
priority: P1
type: bug
---

## Problem

On the owner's iPhone, adding a garden element and editing its width or
length opens the keyboard over the field: the field and its confirm button
are hidden, so the element cannot be saved. The plan's other sheets with a
text field (zone rectangle, new zone name, plan size, the bubble's size
value) share the layout. Also, once a shape is drawn, its size can only be
changed by dragging corners, not by typing its dimensions.

## Why it matters

The owner cannot finish adding an element on the phone, and adjusting a
terrace or a bed to its measured size by dragging corners is imprecise.

## Acceptance criteria

- [ ] On iOS (and Android), every plan sheet or bubble with a text field
      rises above the keyboard and scrolls, so the focused field and the
      sheet's confirm button stay visible; the keyboard's return key
      confirms or moves to the next field; tapping outside closes it
- [x] Editing a garden element or a zone shows a "Dimensions" row
      (Largeur / Longueur in metres) prefilled from the shape's bounding box;
      changing it resizes the shape from its top-left corner (exact for a
      rectangle, proportional for another shape), live, then saved with
      "Terminer"; invalid or too large values are refused in French
- [x] With the magnet on, a resized element's corners stay on the 50 cm grid
      (zones are never snapped)
- [x] Matches the updated PlanElementModifier and PlanModifierZone
      artboards; `npm run verify` and `npm run e2e:web` pass
- [ ] Checked on the owner's iPhone

## Notes

Reported by the owner on 2026-10-01 after installing 105–110 on the iPhone.
The keyboard risk was listed as "only a phone can confirm" in 107 and 110.
