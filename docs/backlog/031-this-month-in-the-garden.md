---
id: 031
title: Show a personalised "Ce mois-ci au jardin" task list
status: done
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

- [x] A section on the dashboard lists this month's tasks derived from every
      plant's pruning month, harvest window, winter care and end of bloom
      (deadheading)
- [x] Each task can be ticked off (writes a care log) or turned into a reminder
- [x] Ticked tasks do not reappear for that month
- [x] The user can look ahead to next month
- [x] Task derivation is a pure function with tests, including year-wrapping
      harvest and bloom ranges

## Notes

Shares its derivation with 022 (seasonal reminders): build one function that
both use. Month names come from `lib/months.js`.

Tasks come from `deriveSeasonalTasks` (shared with 022); a task is done when a
care log of its mapped type exists for that plant in that month, so no new
table. Winter preparation is placed in October (northern hemisphere).
