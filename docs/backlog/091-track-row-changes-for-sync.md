---
id: 091
title: Track row changes and deletions so the garden can sync
status: done
priority: P2
type: feature
---

## Problem

The garden lives only on the device: SQLite in `lib/db.js`, localStorage plus
IndexedDB in `lib/db.web.js`. No row says when it last changed, and a delete
erases the row, so another device could never learn about an edit or a
deletion.

Row ids are already UUIDs (`uuid()` in `lib/db.js`), so two devices never
collide on an id: no id migration is needed.

## Why it matters

This is the prerequisite for the phone ⇄ server ⇄ web sync (092–096). The
owner wants the web app to both show and edit the garden.

## Acceptance criteria

- [x] Every synced table (`zones`, `plants`, `care_logs`, `reminders`,
      `photos`, `unsorted_photos`, `bloom_observations`) gains `updatedAt`
      (ISO timestamp) and `deletedAt` (null unless deleted), through a
      `lib/db.js` migration; existing rows get `updatedAt` = migration time
- [x] Every write sets `updatedAt`; every delete sets `deletedAt` instead of
      removing the row, including cascades (deleting a plant marks its photos,
      care logs, reminders and bloom observations)
- [x] Every read ignores rows with `deletedAt` set, on both platforms
- [x] `app_meta` stays local and is not synced
- [x] A backup (`lib/backupFormat.js`) holds only live rows and carries
      their `updatedAt`; older backups without it still import
      (`backupFormat.test.js`)
- [x] `db-parity.test.js` passes; the web shim behaves the same
      (`db-web.test.js` covers a soft delete)
- [x] `npm run verify` passes

## Notes

Keep the timestamp and soft-delete helpers in a pure module so Jest can test
them (`lib/db.js` cannot be imported under Jest). Export a backup before
running the migration on the iPhone.

`importGarden` still replaces the whole garden with hard deletes; how an
import interacts with sync is left to 094.
