---
id: 031
title: Show a personalised "Ce mois-ci au jardin" task list
status: open
priority: P2
type: feature
---

## Problem

The dashboard shows reminders due today and plants blooming this month. The
seasonal data each plant carries (pruning month, harvest window, winter care,
bloom period) never becomes a monthly to-do list.

## Why it matters

Gardeners plan by the month. A list built from their own plants — "Tailler les
rosiers, récolter les framboises, pailler avant l'hiver" — is more useful than
any generic gardening calendar.

## Acceptance criteria

- [ ] A section on the dashboard lists this month's tasks derived from every
      plant's pruning month, harvest window, winter care and end of bloom
      (deadheading)
- [ ] Each task can be ticked off (writes a care log) or turned into a reminder
- [ ] Ticked tasks do not reappear for that month
- [ ] The user can look ahead to next month
- [ ] Task derivation is a pure function with tests, including year-wrapping
      harvest and bloom ranges

## Notes

Shares its derivation with 022 (seasonal reminders): build one function that
both use. Month names come from `lib/months.js`.
