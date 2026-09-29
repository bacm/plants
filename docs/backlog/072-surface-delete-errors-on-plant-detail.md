---
id: 072
title: Surface errors when deleting a plant or a care log
status: done
priority: P2
type: bug
---

## Problem

`handleDelete` and `handleDeleteCareLog` in `app/plant/[id].js` call
`deletePlant` and `deleteCareLog` (synchronous `runSync` on native, a
localStorage write on web) without a `try`/`catch`.

## Why it matters

If the write throws (a constraint, storage full on web), the error is
swallowed or crashes the handler; the user sees nothing or a red screen
instead of a message (CLAUDE.md rule 6).

## Acceptance criteria

- [x] Both handlers wrap the write in `try`/`catch` and show
      `Alert.alert('Erreur', …)`, leaving the user on the screen
- [x] `npm run verify` passes

## Notes

Found while restyling the plant detail screen (067).
