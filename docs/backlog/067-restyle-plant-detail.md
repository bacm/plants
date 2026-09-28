---
id: 067
title: Restyle the plant detail screen and its three tabs
status: open
priority: P3
type: feature
---

## Problem

`app/plant/[id].js` (1130 lines) uses the old dark cards, emoji tags and plain
text tabs for Info, Photos and Actions.

## Why it matters

The plant sheet is where the owner spends the most time after the dashboard.

## Acceptance criteria

- [ ] Hero photo with round back and edit ("Modifier la fiche") buttons and a
      "1 / N photos" pill; the content sheet overlaps it with rounded top
      corners
- [ ] Name block: type · zone eyebrow, name in Fraunces, italic latin name,
      then chips (colour, traits, type)
- [ ] Tabs Info · Photos · Actions as a segmented control
- [ ] Info: a bloom card with the 12-month strip (current month ringed) and
      Exposition / Arrosage tiles
- [ ] Photos: the gallery grouped by month in a 3-column grid, with the "En
      fleur" tag
- [ ] Actions: reminder cards (an overdue one in terracotta, "Fait" button)
      and the care history as a vertical timeline
- [ ] "Enregistrer un soin" is a sticky bottom button
- [ ] Existing behaviour is unchanged
- [ ] `npm run verify` and `npm run e2e:web` pass

## Notes

Mock-up: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks, artboards "Fiche
plante · Info / Photos / Actions". Depends on 063.

047 (compact header without a photo) still applies: follow it for plants with
no photo. The file is large; extracting each tab into its own component is in
scope if it keeps the diff readable.
