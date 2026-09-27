---
id: 020
title: Export and restore the whole garden, photos included
status: done
priority: P2
type: feature
---

## Problem

All data lives in the on-device SQLite database (`lib/db.js`) and photo files
under the app's document directory. There is no export, backup or sync: nothing
in the app writes data out, and `expo-sharing` is not a dependency.

## Why it matters

Losing or replacing the phone loses every plant, care log and photo history.
Years of photos are the part that cannot be re-entered by hand.

## Acceptance criteria

- [x] A settings entry exports one archive containing every table and every photo
      file, shared through the OS share sheet
- [x] Importing that archive on a fresh install restores plants, zones, reminders,
      care logs and photos, with photos visible on the detail screen
- [x] Import onto a non-empty garden asks whether to replace, and never merges
      silently
- [x] The archive carries a format version; importing an unknown version is
      refused with a message
- [x] The (de)serialisation of rows is a pure module with round-trip tests
- [x] Any new dependency is declared in `package.json`

## Notes

Photo URIs are absolute paths into the app sandbox and change between installs,
so the archive must store paths relative to the photo directory and rewrite them
on import. Natural home for the settings button that 016 removes or wires.

Format `plants-garden-backup` v1: one JSON file, photos embedded as base64 and
stored without platform refs, so a web backup restores on a phone and vice versa
(`lib/backupFormat.js`). Import is validated as untrusted input and replaces the
garden in one `withTransactionSync`; old photo files are removed only after it
commits. Export and import live on the new Réglages screen. Limit: the whole
archive is built in memory, so a very large photo library makes a very large
file. Covered end to end on web; the native share sheet, document picker and
rollback path are in 040.
