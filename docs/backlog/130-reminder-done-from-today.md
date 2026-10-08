---
id: 130
title: Mark a reminder done from today and always log it in the journal
status: open
priority: P1
type: bug
---

## Problem

`markReminderDone` (`lib/db.js:740`, `lib/db.web.js:539`) computes the next
due date from the old due date, not from the day the task was done. A weekly
watering three weeks late is still two weeks late after "Fait".

The journal entry is written by the callers, not by `markReminderDone`:
the dashboard (`app/(tabs)/index.js` `completeReminder`) and the plant sheet
(`app/plant/[id].js` `handleReminderDone`) each keep their own kind→care map,
and they disagree (`winter_prep` → `treated` on the sheet). The "Rappels"
screen (`app/plant/reminders.js` `doNow`) writes no entry at all.

## Why it matters

Overdue tasks cannot be cleared, and the journal misses care done from the
reminders screen.

## Acceptance criteria

- [ ] An interval reminder done on day D is next due on D + frequency;
      `lastDoneDate` is D
- [ ] A yearly reminder keeps its calendar date: it moves forward a year at a
      time until it is after D
- [ ] Every "Fait" (dashboard, plant sheet, reminders screen, "Tout faire")
      writes one journal entry dated D with the care type of the reminder kind
- [ ] The kind → care type mapping is declared once, next to `REMINDER_KINDS`
      in `lib/enums.js`; the screens hold no map
- [ ] The next-date rule is a pure, Jest-tested function; `npm run verify`
      and `npm run e2e:web` pass
