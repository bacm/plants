---
id: 067
title: Restyle the plant detail screen and its three tabs
status: done
priority: P3
type: feature
---

## Problem

`app/plant/[id].js` (1130 lines) uses the old dark cards, emoji tags and plain
text tabs for Info, Photos and Actions.

## Why it matters

The plant sheet is where the owner spends the most time after the dashboard.

## Acceptance criteria

- [x] Hero photo with round back and edit ("Modifier la fiche") buttons and a
      "1 / N photos" pill; the content sheet overlaps it with rounded top
      corners
- [x] Name block: type · zone eyebrow, name in Fraunces, italic latin name,
      then chips (colour, traits, type)
- [x] Tabs Info · Photos · Actions as a segmented control
- [x] Info: a bloom card with the 12-month strip (current month ringed) and
      Exposition / Arrosage tiles
- [x] Photos: the gallery grouped by month in a 3-column grid, with the "En
      fleur" tag
- [x] Actions: reminder cards (an overdue one in terracotta, "Fait" button)
      and the care history as a vertical timeline
- [x] "Enregistrer un soin" is a sticky bottom button
- [x] Existing behaviour is unchanged
- [x] `npm run verify` and `npm run e2e:web` pass

## Notes

Mock-up: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks, artboards "Fiche
plante · Info / Photos / Actions". Depends on 063.

047 (compact header without a photo) still applies: follow it for plants with
no photo. The file is large; extracting each tab into its own component is in
scope if it keeps the diff readable.

Done. Tabs live in `components/plant/` (InfoTab, PhotosTab, ActionsTab); the
screen keeps data loading and handlers. New pure helpers, both tested:
`lib/photoGroups.js` (photos by month) and `lib/reminderDue.js` (the due
line). "En fleur" on a photo comes from the plant's bloom observations for
that date. The Historique "+ Log" link is gone: the sticky "Enregistrer un
soin" button opens the same screen. New tokens: `track`, `sun`, `water`.
