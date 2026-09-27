---
id: 022
title: Suggest seasonal reminders from pruning, harvest and winter-care data
status: done
priority: P2
type: feature
---

## Problem

Plants already store `pruningMonth`, `harvestMonthStart`/`harvestMonthEnd` and
`winterCare` (`lib/plantFields.js`), but reminders are only created by hand in
`app/plant/reminders.js`, apart from a default weekly watering reminder in
`app/plant/new.js`.

## Why it matters

The data needed to say "prune the hydrangea in March" is already entered and
then ignored, so the user has to recreate the same information as reminders.

## Acceptance criteria

- [x] From the plant's reminders screen, the user can accept suggested yearly
      reminders derived from its pruning month, harvest window and winter care
- [x] Suggestions are never created without the user accepting them
- [x] A suggestion already covered by an existing reminder of the same kind is not
      offered again
- [x] Yearly recurrence is correct across year boundaries and leap years
- [x] The derivation is a pure function with tests, reusing `lib/months.js` and
      `lib/dates.js`

## Notes

Reminders are frequency-in-days today; a yearly reminder either needs a
`frequencyDays` of 365 with drift, or a real "same date every year" rule. Decide
in the plan; the second is correct.

Yearly reminders are a real rule: `repeatRule = 'yearly'` (new column) advances
`nextDueDate` with `addYearsISO`, not 365 days. Suggestions and the dashboard
share `lib/seasonalTasks.js`.
