---
id: 119
title: Photo viewer shows an ISO date and plain header buttons
status: done
priority: P3
type: bug
---

## Problem

Comparing the web build with the PhotoVisionneuse and PhotoAccueil artboards
(ticket 089) showed two gaps in the plant photo viewer (`app/plant/[id].js`):
the date line read "2026-04-01 · 2 / 2" instead of "1 avril 2026 · 2 / 2",
and "Retour" / "Mettre en accueil" were bare text instead of round pills.

## Why it matters

The ISO date is hard to read, and the bare labels are small, hard-to-see
touch targets on a dark, photo-filled screen.

## Acceptance criteria

- [x] The date line uses `isoDateLabel` from `lib/months.js` ("1 avril 2026 · 2 / 2")
- [x] "Retour" and "Mettre en accueil" / "Photo d'accueil" are 44 px round
      pills on `colors.onDarkChipBg`, as in the artboards
- [x] `npm run verify` and the photo viewer e2e specs pass

## Notes

Found while closing 089 (2026-10-01).
