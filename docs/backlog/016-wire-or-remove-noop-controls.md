---
id: 016
title: Three buttons and a hero subtitle do nothing
status: open
priority: P3
type: chore
---

## Problem

- `app/(tabs)/index.js:117` and `:124` — the settings and profile buttons in the
  dashboard hero both have `onPress={() => {}}`
- `app/(tabs)/zones/index.js:133` — the settings button, same
- `app/(tabs)/index.js:30` — `HEADER_SUBTITLE` is the constant string
  "En ce moment : La floraison de printemps bat son plein.", rendered in every
  month of the year

## Why it matters

A button that visibly responds to touch and then does nothing reads as a bug rather
than an unfinished feature. The hardcoded subtitle is wrong for roughly nine months
of the year, on the first screen the user sees.

## Acceptance criteria

- [ ] Each button either navigates somewhere real or is removed
- [ ] The hero subtitle reflects the current month and the actual state of the
      garden, or is removed
- [ ] No `onPress={() => {}}` remains in `app/`

## Notes

There is no settings screen and nothing user-specific to put behind a profile
button, so removing all three is the smaller and more honest change. If a settings
screen is wanted, that is a feature ticket.

A month-aware subtitle can be derived from what the existing dashboard queries
already return — for instance the number of plants blooming this month — rather
than needing new data.
