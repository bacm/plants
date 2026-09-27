---
id: 011
title: Enum labels and month names are duplicated across seven files
status: open
priority: P2
type: refactor
---

## Problem

Five separate month-name arrays exist, with three different abbreviation schemes:

| File | Constant | Form |
| --- | --- | --- |
| `app/(tabs)/bloom.js:16` | `MONTHS` | full names |
| `app/(tabs)/index.js:29` | `MONTHS_FULL` | full, but `Juil.` `Sept.` `Oct.` abbreviated |
| `app/plant/[id].js:37` | `MONTHS` | `Jan` `Fév` `Mar` |
| `app/plant/new.js:45` | `MONTHS_LABELS` | same three-letter set |
| `app/plant/edit.js:45` | `MONTHS_LABELS` | same three-letter set |

The same holds for `SUN_LABELS` (5 copies, two with different capitalisation —
`app/(tabs)/zones/index.js:16` uses `Plein Soleil`, others `Plein soleil`),
`WATER_LABELS`, `TYPE_LABELS`, `CARE_LABELS`, `REMINDER_LABELS`,
`SOIL_TYPE_LABELS`, `SOIL_PH_LABELS`, `PROPAGATION_LABELS`, `TOXICITY_LABELS`, and
the `colorHex` function (identical in `app/(tabs)/library.js:172`,
`app/(tabs)/bloom.js:124` and `app/(tabs)/zones/[id].js:120`).

## Why it matters

The same month renders differently on two screens, and the same exposure is
capitalised two ways. Adding an enum value means finding every copy — and the
enums themselves already live in `lib/db.js`, one import away from the labels that
describe them.

## Acceptance criteria

- [ ] One module owns the month names, in both full and abbreviated form
- [ ] One module owns the label map for each enum exported by `lib/db.js`
- [ ] `colorHex` exists once
- [ ] No screen declares a label map or a month array
- [ ] A test asserts every enum value has a label, so adding a value without its
      label fails the build

## Notes

Rule 4 in CLAUDE.md. A natural home is `lib/labels.js` next to the enums, or the
field definition from 008 if that lands first — labels are arguably part of a
field's definition.

Deliberately not an i18n framework: the UI is French-only today and introducing
one is a separate decision.
