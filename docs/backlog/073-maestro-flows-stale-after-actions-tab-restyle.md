---
id: 073
title: Maestro flows 02 and 03 target Actions-tab text removed in 067
status: done
priority: P2
type: bug
---

## Problem

`e2e/ios/02-reminder-done-advances.yaml` asserts and copies
"Prochaine : …" on the plant detail's Actions tab, and
`e2e/ios/03-back-after-save.yaml` taps "+ Log". Ticket 067 restyled that
tab: reminders now show `reminderDueText` ("Dans N jours · 2 oct.",
"Aujourd’hui", "En retard de N jours") and the care log is opened from the
sticky "Enregistrer un soin" button. Neither string exists any more.

## Why it matters

Both flows fail before reaching what they check: 02 guards the ticket 002
regression (markReminderDone as a no-op), 03 the ticket 035 dead back
button. The iOS suite is run before a device deploy, so it would block the
next one — or be ignored.

## Acceptance criteria

- [x] 02 checks that tapping "Fait" changes the reminder's due line and logs
      "Arrosé", using text the Actions tab actually renders
- [x] 03 opens the care log from "Enregistrer un soin" and still checks the
      back button after saving
- [x] Both flows pass on the simulator (run just these two, not the suite)

## Notes

Found while working on 070. Flows 01, 04 and the seeds were already updated
for the new plant form in 069, unverified on a simulator.
