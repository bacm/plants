---
id: 128
title: Record a bloom from the dashboard and show a bloom memory there
status: open
priority: P2
type: feature
---

## Problem

Split from 029. The plant detail records the start and end of flowering and
shows each year's observed window, but the dashboard does neither: there is no
one-tap "en fleur" there, and no memory such as "Il y a un an, vos pivoines
fleurissaient".

## Why it matters

The dashboard is where the owner looks each day. A bloom recorded from there
costs one tap instead of three, and a memory is a reason to open the app.

## Acceptance criteria

- [ ] The dashboard offers a one-tap "en fleur aujourd'hui" for plants whose
      declared or last observed window covers today, and "fin de floraison" for
      plants already marked in flower
- [ ] The dashboard shows at most one bloom memory per day, picked by a pure
      function with tests (from `lib/bloomHistory.js`'s seasons)
- [ ] Matches a mock-up artboard added for it; `npm run verify` and
      `npm run e2e:web` pass

## Notes

Belongs with 058 ("Aujourd'hui au jardin"), which redesigns the dashboard; do
both together or after it.
