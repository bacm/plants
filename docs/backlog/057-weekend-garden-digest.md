---
id: 057
title: Send a Saturday-morning "ce week-end au jardin" digest
status: open
priority: P2
type: feature
---

## Problem

The weekend is when most gardening happens, and nothing tells the user what is
worth doing then. Reminders (and 021's notifications) fire task by task.

## Why it matters

One useful, predictable message a week is the strongest reason to open the app
without nagging.

## Acceptance criteria

- [ ] On Saturday at 8:00 local time, one notification summarises the weekend:
      due and overdue tasks, this month's seasonal tasks not yet done (031),
      what is in bloom, and the weather when 028/025 provide it
- [ ] Tapping it opens the dashboard; nothing is sent when there is nothing
- [ ] Can be turned off, and the day/time changed, in Réglages
- [ ] Never more than one app notification per day in total, digest included
- [ ] The digest content is a pure function with tests

## Notes

Depends on 021 (notification plumbing).
