---
id: 032
title: Flag plants that are not hardy in the garden's climate
status: open
priority: P3
type: feature
---

## Problem

Plants store `minTemperature`, but the app does not know how cold the garden
gets, so it cannot say which plants are at risk every winter.

## Why it matters

Buying or keeping a plant that will not survive the local winter is a common,
expensive mistake. Frost alerts (025) warn the night before; this warns at
planting time.

## Acceptance criteria

- [ ] From the garden location, the app derives the typical coldest winter
      temperature (historical climate data) and shows the corresponding
      hardiness zone
- [ ] Plants whose `minTemperature` is above that value are flagged on their
      detail screen and in the library, with a suggested action (pot, winter
      protection)
- [ ] When adding a plant, a non-hardy result is shown before saving
- [ ] Without location, nothing is flagged and nothing breaks
- [ ] The comparison is a pure function with tests

## Notes

Reuses the location setting from 025/028. Open-Meteo's historical API gives
yearly minimums without a key; cache the derived value, it changes once a year
at most.
