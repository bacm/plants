---
id: 131
title: Edit a reminder and postpone it by a few days
status: done
priority: P2
type: feature
---

## Problem

A reminder can be created, marked done or deleted (`app/plant/reminders.js`),
but not changed: there is no `updateReminder` in `lib/db.js`. Changing a
watering from 7 to 10 days means deleting and recreating it. There is also no
way to push a task back when it is not the right day.

## Why it matters

Frequencies need adjusting with the season; deleting and recreating loses the
last-done date.

## Acceptance criteria

- [x] Tapping a reminder on the "Rappels" screen opens it for editing:
      frequency (interval reminders) and next due date, validated with
      `lib/validation.js`; save errors show an alert and keep the form open
- [x] The same edit offers "Reporter" with +1, +3 and +7 days, counted from
      the later of today and the due date
- [x] `updateReminder` exists in `lib/db.js` and `lib/db.web.js`, only
      writes an allowlist of columns, bumps `updatedAt` and syncs
- [x] The postpone rule is a pure, Jest-tested function; `npm run verify` and
      `npm run e2e:web` pass
