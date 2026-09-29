---
id: 078
title: Change the date of a photo after adding it
status: open
priority: P1
type: feature
---

## Problem

A photo's date is chosen once, when it is added. Afterwards the lightbox shows
it read-only and no storage function updates it, so a wrong date (a photo
taken last spring, added today) cannot be fixed.

## Why it matters

Photo dates drive the photo history, the "En fleur" tags and the year-over-year
comparison (029); a wrong date misplaces the photo everywhere.

## Acceptance criteria

- [ ] From the lightbox, the date can be edited ("Modifier la date"), with the
      same AAAA-MM-JJ validation as when adding
- [ ] `updatePhotoDate(id, date)` exists in `lib/db.js` and `lib/db.web.js`
- [ ] The photo moves to its new place in the Photos tab right away
- [ ] A failed update shows an error and keeps the lightbox open
- [ ] `npm run verify` and `npm run e2e:web` pass, with an e2e check changing a
      photo's date

## Notes

Reported by the owner on 2026-09-29.
