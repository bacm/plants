---
id: 135
title: Filter the plant library by zone
status: done
priority: P3
type: feature
---

## Problem

Bibliothèque filters by plant type only (`app/(tabs)/library.js`).

## Why it matters

"What is in the front bed?" means opening Zones instead of the list the user
is already on.

## Acceptance criteria

- [x] A second row of pills lists "Toutes zones", each zone and "Sans zone";
      it combines with the type filter and the search
- [x] The empty-state message accounts for the zone filter
- [x] `npm run verify` and `npm run e2e:web` pass
