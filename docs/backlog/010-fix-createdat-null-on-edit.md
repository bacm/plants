---
id: 010
title: Clearing the "date d'ajout" field makes saving a plant fail silently
status: done
priority: P2
type: bug
---

## Problem

`app/plant/edit.js:230` sends `createdAt: createdAt ? new Date(createdAt).toISOString() : null`.
The column is declared `createdAt TEXT NOT NULL` (`lib/db.js:31`), so clearing the
field makes SQLite reject the `UPDATE`.

There is no `try`/`catch` around any write in the codebase, so the exception
propagates out of the `save` handler and is swallowed by React Native's promise
handling. `router.replace` never runs.

## Why it matters

The user clears the date, taps Enregistrer, and nothing happens — no error, no
navigation, no saved change. Every other edit on the form is lost with it.

## Acceptance criteria

- [x] An empty "date d'ajout" either keeps the existing value or is rejected with a
      visible message; it never reaches the database as `NULL`
- [x] Writes in `save` are wrapped so a failure surfaces to the user instead of
      disappearing
- [x] The same treatment is applied to the other write paths in `app/plant/new.js`,
      `app/plant/log.js`, `app/plant/reminders.js` and `app/zone/new.js`

## Notes

Rule 6 in CLAUDE.md exists because of this ticket. Fixing the `createdAt` case
without adding the error handling leaves the underlying silence in place, so do
both.
