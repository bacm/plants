---
id: 065
title: Extract shared form components for fields, chips and month ranges
status: open
priority: P2
type: refactor
---

## Problem

`app/plant/new.js` (878 lines), `app/plant/edit.js` (911), `app/plant/log.js`,
`app/plant/reminders.js` and `components/ZoneForm.js` each style their own text
inputs, pills, segmented choices and month pickers.

## Why it matters

Restyling five forms that each re-implement the same controls means five
diverging copies of the new design. The approved mock-up uses one form style
everywhere.

## Acceptance criteria

- [ ] `components/form/` provides: `Field` (label above a rounded input or
      textarea), `ChipGroup` (single choice, pill chips, selected = ink),
      `ChoiceTiles` (icon tiles, e.g. Exposition / Arrosage / care types),
      `MonthRangePicker` (12 cells J…D, a start–end range that may wrap the
      year), `FormSection` (card with an uppercase eyebrow) and
      `PrimaryButton` (full-width, 56 pt)
- [ ] `MonthRangePicker` uses `isMonthInRange` from `lib/months.js`; its
      range logic is covered by a test
- [ ] `ChipGroup` over an enum uses `choices()` / `toggleChip()` from
      `lib/enums.js`
- [ ] Every control is 44 pt minimum, has an accessibilityLabel and exposes
      its selected state
- [ ] The components use only `lib/theme.js` tokens
- [ ] `npm run verify` passes

## Notes

Mock-up: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks, row "Saisie".
Depends on 063. Screens adopt these in 069 and 070; this ticket only adds them.
