---
id: 009
title: Month and date fields accept any text and render undefined
status: open
priority: P2
type: bug
---

## Problem

Bloom and harvest months are free-text `TextInput`s parsed with `parseInt` and
stored unchecked (`app/plant/new.js:161`, `app/plant/edit.js:208`). Entering `13`
stores `13`, and `app/plant/[id].js:290` then renders `MONTHS[12]` — the string
`undefined` — in the technical details card.

Dates are entered the same way: `app/plant/log.js:104` and the photo-date modal in
`app/plant/[id].js:633` take a raw `AAAA-MM-JJ` string. The photo modal validates
with a regex and falls back to today; the care-log date does not validate at all.

## Why it matters

A typo silently corrupts a record, and the plant detail screen displays
`undefined` rather than an error. A malformed care-log date sorts wrongly in the
history list, since ordering is a string comparison.

## Acceptance criteria

- [ ] A month outside 1–12 cannot be saved; the field shows why
- [ ] A malformed date cannot be saved; the same validation is used by the care-log
      form and the photo-date modal rather than one having its own regex
- [ ] `MONTHS[...]` lookups cannot render `undefined` even if a bad row already
      exists in the database
- [ ] Validation lives in a pure module and is covered by tests

## Notes

Month pickers would remove the class entirely — `app/plant/new.js:551` already uses
a pill row for the pruning month. Reusing that control for bloom and harvest is
probably less code than validating free text.

Pairs naturally with 011, which centralises the month labels those pickers need.
