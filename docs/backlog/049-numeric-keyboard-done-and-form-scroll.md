---
id: 049
title: Numeric keyboards on iOS cannot be dismissed on long forms
status: open
priority: P2
type: bug
---

## Problem

On iOS, number-pad fields (months, height, width, temperature) have no return
key, so on the long new/edit plant forms the keyboard covers the save button and
the only way out is tapping an empty area. Found in the iOS simulator review.

## Why it matters

Users get stuck mid-form on the main data-entry screens.

## Acceptance criteria

- [ ] Numeric fields on iOS have an accessory bar with "OK" that dismisses the
      keyboard (e.g. `InputAccessoryView`), or tapping outside reliably dismisses
- [ ] The focused field is never hidden by the keyboard on new/edit plant, log,
      reminders and zone forms (KeyboardAvoidingView / scroll into view)
- [ ] Checked in the iOS simulator (055 flows) and on web
