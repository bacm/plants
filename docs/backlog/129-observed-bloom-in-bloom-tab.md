---
id: 129
title: Show observed bloom windows next to declared months in the bloom tab
status: open
priority: P3
type: feature
---

## Problem

Split from 029. The Floraison tab draws only the declared bloom months. The
windows actually observed in this garden (`lib/bloomHistory.js`) are shown on
the plant detail but not alongside the other plants.

## Why it matters

Comparing what the books say with what the garden does is the point of
recording blooms, and the year view is where plants are compared.

## Acceptance criteria

- [ ] The bloom tab can show each plant's observed window for the current or
      last season alongside its declared months
- [ ] Matches a mock-up artboard; `npm run verify` and `npm run e2e:web` pass

## Notes

Do it with 074 (restyle the rest of the Floraison screen), which waits for the
owner to decide whether the month view stays.
