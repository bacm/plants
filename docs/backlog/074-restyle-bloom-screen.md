---
id: 074
title: Restyle the rest of the Floraison screen to the Herbier mock-up
status: open
priority: P3
type: feature
---

## Problem

050 redrew the "Sur l'année" chart, but the Floraison screen around it still
uses the old style: GradientHero, GlassCard, the accent "Par mois / Sur
l'année" switch, the month pill strip and the month view's plant cards.

## Why it matters

It is the last tab left in the old style, next to four restyled ones.

## Acceptance criteria

- [ ] "Calendrier" eyebrow and a Fraunces "Floraison" title, as on the other tabs
- [ ] The dark summary card: "En <mois>", "N plantes en fleurs" and overlapping
      flower-colour dots
- [ ] The year chart sits in a plain surface card (no GlassCard)
- [ ] The month view and its switch use the shared components; decide with the
      owner whether the mock-up's single year view replaces "Par mois"
- [ ] `npm run verify` and `npm run e2e:web` pass

## Notes

Mock-up: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks, artboard
"Floraison". The mock-up has no month view at all; that is an owner decision,
not something to drop silently. Found while working on 050.
