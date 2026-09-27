---
id: 002
title: markReminderDone never advances nextDueDate on native
status: open
priority: P0
type: bug
---

## Problem

`lib/db.js:415` calls `db.getFirstAsync(...)` without `await`:

```js
const r = db.getFirstAsync('SELECT * FROM reminders WHERE id = ?', [id]);
if (!r || !r.nextDueDate) return;   // r is a Promise, so r.nextDueDate is undefined
```

`r` is a truthy Promise, `r.nextDueDate` is `undefined`, and the guard returns
before the `UPDATE` ever runs. The web implementation (`lib/db.web.js:218`) is
correct, so this is native-only.

The line is currently marked with an `eslint-disable-next-line no-restricted-syntax`
pointing at this ticket. Removing that comment is part of the fix.

## Why it matters

The "Fait" button appears on three screens. Tapping it writes a care log but never
moves the due date, so:

- the reminder stays due forever and the dashboard task list never empties
- every tap appends a duplicate care log to the plant's history

## Acceptance criteria

- [ ] `markReminderDone` is `async` and awaits its read
- [ ] The three call sites await it: `app/(tabs)/index.js:69`,
      `app/plant/[id].js:158`, `app/plant/reminders.js:65` — all are already
      inside `async` functions
- [ ] The `eslint-disable-next-line` in `lib/db.js` is deleted and `npm run lint`
      passes without it
- [ ] `nextDueDate` advances by exactly `frequencyDays` from the previous
      `nextDueDate`, not from today, so a reminder done late does not drift
- [ ] `lastDoneDate` records the date the reminder was due

## Notes

`lib/db.js` cannot be imported under Jest (it calls `SQLite.openDatabaseSync` at
module scope), so this is not directly unit-testable today. The date arithmetic is
worth extracting into a pure helper that a test can cover — that also serves 008.
