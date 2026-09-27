---
id: 021
title: Notify the user when a reminder falls due
status: open
priority: P2
type: feature
---

## Problem

Reminders (`reminders` table, `lib/db.js`) are only visible when the user opens
the dashboard. `expo-notifications` is not installed and nothing is scheduled.

## Why it matters

A watering or pruning reminder that is never seen until the app is opened does
not remind anyone.

## Acceptance criteria

- [ ] Permission is requested the first time a reminder exists, not at launch
- [ ] Each enabled reminder has one local notification scheduled for its
      `nextDueDate` at a fixed morning hour
- [ ] Marking a reminder done, editing it or deleting it reschedules or cancels
      its notification; deleting a plant cancels all of its notifications
- [ ] Tapping the notification opens that plant's detail screen
- [ ] Refusing permission leaves the app fully usable
- [ ] Scheduling decisions (which reminders, which time) are a pure function with
      tests; `expo-notifications` is declared in `package.json`

## Notes

Needs a development build for iOS; Expo Go is limited for notifications. Several
reminders due the same morning should be one grouped notification rather than a
burst. Prerequisite for 025.

Notification budget: at most one app notification per day, grouped; 057 adds
the weekend digest on top of this plumbing.
