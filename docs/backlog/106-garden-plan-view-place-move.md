---
id: 106
title: Show the garden plan and place and move plants on it
status: in-progress
priority: P2
type: feature
---

## Problem

With the data of 105, the owner still has no way to see the plan or to put a
plant on it.

## Why it matters

Placing each plant is the point of the plan: a plan with only zones was
judged useless.

## Acceptance criteria

- [x] Zones has a "Plan" button next to its title (no Liste | Plan toggle)
      opening the plan screen
- [x] First visit: width × length in metres, a preview to scale, "Créer le
      plan"; the size can be enlarged later
- [x] The plan shows a 1 m grid (stronger line every 5 m), the drawn zones
      with name and area, and every placed plant as a dot at its real width
      (fixed size when unknown, never smaller than a touchable size)
- [ ] Pinch and drag zoom and pan on the phone; "+", "−" and "Voir tout" work
      with a mouse on the web
- [x] A drawer "À placer · N" lists unplaced plants; a long press drags one
      onto the plan
- [x] A single tap shows a bubble with the full name, zone and width; tapping
      the bubble opens the plant sheet; tapping elsewhere closes it
- [x] A long press lifts a placed plant to move it; dropping it saves the
      position; dropping it in another drawn zone changes its zone, outside
      every zone clears it, and a banner "… déplacée vers … · Annuler" undoes
      the move
- [x] Everything is saved locally and synced (phone ⇄ web)
- [x] Matches the Herbier artboards Zones, PlanCreer, Plan, PlanBulle and
      PlanDeplacer; `npm run verify` and `npm run e2e:web` pass

## Notes

Depends on 105. Drawing uses `react-native-svg` (added with `npx expo
install`, CLAUDE.md rule 8). Zoom follows `components/ZoomableImage.js`
(pinch around the focal point) with pan always on and a separate gesture for
dragging a plant.
