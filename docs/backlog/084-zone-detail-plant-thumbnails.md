---
id: 084
title: Show each plant's photo thumbnail on the zone detail screen
status: done
priority: P2
type: feature
---

## Problem

The zone detail screen (`app/(tabs)/zones/[id].js`) listed its plants with
only a 14px flower-colour dot, while the dashboard, the library, the sort
screen and the camera all show the plant's latest photo. `getPlants` already
returns that photo as `photoUri`; the screen just never rendered it.

## Why it matters

In a zone the owner recognises a plant by its photo first; several plants of
the same kind (same name up to an "est 1" / "est 2" suffix) look alike in a
text-only list.

## Acceptance criteria

- [x] Each row shows a 48px round thumbnail of the plant's latest photo, or a
      leaf on light green when it has none (same placeholder as the library)
- [x] The flower colour, when set, stays as a small dot on the thumbnail's
      corner
- [x] The mock-up's "Détail d'une zone" artboard matches
- [x] UI-only change with no logic to unit test; checked with a screenshot of
      the web build at 390×844; `e2e/web-smoke.spec.js` passes
- [x] `npm run verify` passes

## Notes

Mock-up updated 2026-09-29: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks
