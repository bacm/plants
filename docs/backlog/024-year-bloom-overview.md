---
id: 024
title: Show the garden's bloom coverage across the whole year
status: open
priority: P3
type: feature
---

## Problem

`app/(tabs)/bloom.js` shows the plants blooming in one selected month. There is
no view of the whole year, so gaps are invisible.

## Why it matters

Knowing that nothing flowers in August is exactly what a gardener needs when
choosing what to plant next.

## Acceptance criteria

- [ ] The bloom tab offers a 12-month view with one row per flowering plant
- [ ] Ranges that wrap the year (November to February) render correctly
- [ ] Months with no bloom at all are visibly marked
- [ ] Rows use each plant's flower colour via `colorHex` from `lib/theme.js`
- [ ] Coverage per month is computed by a pure function, tested, using
      `isMonthInRange`

## Notes

Depends on 011 (month names, `colorHex`) and 007 (wrap rule), both done or in
progress.
