---
id: 102
title: Export and import a large garden without one giant string
status: in-progress
priority: P1
type: bug
---

## Problem

On the owner's iPhone, "Exporter mon jardin" fails with "string length
exceeded limit". `app/settings.js` builds the whole backup, every photo as
base64 inside it, then `JSON.stringify`s it into one string; with a photo
library of several hundred MB that string is longer than Hermes allows.
`exportGarden` (`lib/db.js`) also holds every photo's base64 in memory at
once, and import reads the file back as one string for `JSON.parse`, so
import would hit the same wall.

## Why it matters

The owner has no working backup of their garden, and one is needed before
the next iPhone install (it migrates the database, ticket 091) and before
the first sync (096).

## Acceptance criteria

- [x] Export writes the backup file piece by piece: no string or buffer ever
      holds more than one photo; memory stays flat whatever the garden size
- [x] Import reads the file piece by piece and writes each photo to disk as
      it goes, then replaces the garden in one transaction as today
- [x] Backups written before this change (one JSON object) still import
- [x] The same code path works on the web build (Blob parts to write,
      `File.stream()` to read)
- [x] Jest covers the new format: round trip, a truncated or corrupted
      file refused before anything is replaced, an old-format file, and a
      large simulated garden where no single chunk exceeds one photo
- [ ] Checked on the iPhone with the real garden: the export completes, and
      the file imports back on the simulator with the same counts
- [x] `npm run verify` and `npm run e2e:web` pass

## Notes

Hermes has no guaranteed `TextDecoder`, so the new file is pure ASCII
(non-ASCII characters escaped as `\uXXXX` in JSON), which makes decoding a
byte chunk trivial. Found while starting 101; 101 waits for this fix.
