---
id: 025
title: Warn before a frost that is colder than a plant tolerates
status: open
priority: P3
type: feature
---

## Problem

Each plant stores `minTemperature`, but nothing compares it with the weather.

## Why it matters

Frost is the most common way a garden plant is lost, and it is predictable a day
or two ahead.

## Acceptance criteria

- [ ] The user sets the garden's location once (manual entry or one-time device
      location), stored locally
- [ ] Once a day, the forecast minimum for the next 48 hours is fetched
- [ ] If it is below a plant's `minTemperature`, a notification lists the plants
      at risk and the expected minimum
- [ ] No alert for plants without `minTemperature`; no duplicate alert for the
      same night
- [ ] The at-risk computation is a pure function with tests

## Notes

Depends on 021 (notifications). Open-Meteo needs no API key; if a keyed provider
is ever used, the call goes through `server/`, never the client (CLAUDE.md rule
2). Background fetch on iOS is not guaranteed to run daily; checking on app open
is the reliable fallback.
