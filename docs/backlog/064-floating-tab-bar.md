---
id: 064
title: Floating tab bar with a central camera button
status: open
priority: P3
type: feature
---

## Problem

`app/(tabs)/_layout.js` uses the default bottom tab bar with emoji icons, and
the camera is reached through a fake tab (`camera-tab.js`).

## Why it matters

The tab bar is on every main screen; it sets the look of the whole app.

## Acceptance criteria

- [ ] A floating dark pill bar (ink background, 68 pt tall, 16 pt side margins,
      above the home indicator) replaces the default tab bar
- [ ] Order: Accueil, Zones, camera, Floraison, Bibliothèque; the active tab
      shows its icon and label on a sprout-green pill, the others icon only
- [ ] The camera button opens `app/capture.js`, as today
- [ ] Every tab has an accessibilityLabel; the active one is marked selected
- [ ] Scrollable screens get enough bottom padding that their last item clears
      the bar
- [ ] `npm run verify` and `npm run e2e:web` pass

## Notes

Mock-up: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks, any tab artboard.
Depends on 063 (tokens) and 052 (icons).
