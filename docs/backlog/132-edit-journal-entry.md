---
id: 132
title: Edit a journal entry after saving it
status: open
priority: P2
type: feature
---

## Problem

Journal entries can be created (`app/plant/log.js`) and deleted from the
plant sheet, but not changed: there is no `updateCareLog`. A wrong date, type
or measurement has to be deleted and typed again.

## Why it matters

Measurements drive the plan size (115) and dates drive seasonal tasks; a typo
should be a quick fix.

## Acceptance criteria

- [ ] Tapping a journal entry on the plant sheet opens the entry screen
      prefilled (type, date, notes, measurement), titled "Modifier l'entrée"
- [ ] Saving updates that entry; nothing new is created; errors show an alert
      and keep the form open
- [ ] `updateCareLog` exists in `lib/db.js` and `lib/db.web.js`, goes through
      the same normalisation as `createCareLog`, bumps `updatedAt` and syncs;
      a new width clears a manual plan size as on creation
- [ ] `npm run verify` and `npm run e2e:web` pass
