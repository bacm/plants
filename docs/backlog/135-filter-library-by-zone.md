---
id: 135
title: Filter the plant library by zone
status: open
priority: P3
type: feature
---

## Problem

Bibliothèque filters by plant type only (`app/(tabs)/library.js`).

## Why it matters

"What is in the front bed?" means opening Zones instead of the list the user
is already on.

## Acceptance criteria

- [ ] A second row of pills lists "Toutes zones", each zone and "Sans zone";
      it combines with the type filter and the search
- [ ] The empty-state message accounts for the zone filter
- [ ] `npm run verify` and `npm run e2e:web` pass
