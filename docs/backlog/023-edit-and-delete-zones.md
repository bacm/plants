---
id: 023
title: Let the user rename, edit and delete a zone
status: done
priority: P3
type: feature
---

## Problem

`updateZone` and `deleteZone` exist in `lib/db.js` but no screen calls them. A
zone can be created (`app/zone/new.js`) and never changed afterwards.

## Why it matters

A typo in a zone name, or a bed that no longer exists, is permanent.

## Acceptance criteria

- [x] A zone's name, icon and description can be edited from the zone screen
- [x] Deleting a zone asks for confirmation, says how many plants it holds, and
      leaves those plants in the garden with no zone rather than deleting them
- [x] Both functions exist in `lib/db.web.js` with the same behaviour
- [x] Write failures are surfaced to the user (CLAUDE.md rule 6)

## Notes

014 lists `updateZone`/`deleteZone` as unused exports; this ticket is the
"wire them" answer, so 014 must not delete them.

`updateZone` now goes through `pickZoneUpdates` (`lib/zoneFields.js`), the same
allowlist guard as plants. Create and edit share `components/ZoneForm.js`.
