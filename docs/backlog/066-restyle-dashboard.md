---
id: 066
title: Restyle the dashboard to the Herbier mock-up
status: done
priority: P3
type: feature
---

## Problem

`app/(tabs)/index.js` still has the old layout: `GradientHero`, glass cards,
emoji.

## Why it matters

It is the first screen the owner sees.

## Acceptance criteria

- [x] Header: date eyebrow and "Votre _jardin_" title in Fraunces, a Réglages
      button on the right
- [x] "Tâches du jour" is one white card: a count badge, "Tout marquer fait",
      and one row per task (tinted icon square, action, plant · zone, a round
      "Fait" button of 44 pt)
- [x] "En fleurs ce mois" is a horizontal row of photo cards with a colour
      tag; "Voir tout" opens Floraison
- [x] Existing behaviour is unchanged (same data, same actions)
- [x] `npm run verify` and `npm run e2e:web` pass

## Notes

Mock-up: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks, artboard
"Accueil". Depends on 063, 064.

This is the visual pass only. 058 changes what the dashboard shows (weather,
memories, capture); do 058 after this, in the same style.
