---
id: 043
title: Photos live in the image picker's cache and can disappear
status: done
priority: P1
type: bug
---

## Problem

`addPhoto` (`lib/db.js`, `lib/db.web.js`) stores the `uri` returned by
`expo-image-picker` as is (`app/plant/[id].js`, `app/plant/log.js`).

- **Native:** that URI points into the picker's cache directory. The OS may purge
  caches at any time (low storage, app update), so photos can vanish while their
  rows remain. `deletePhoto` deletes the cached file, not an owned copy.
- **Web:** the picker returns the image inline; `lib/db.web.js` keeps it in
  `localStorage`, whose quota (about 5 MB) a few photos exhaust, after which every
  `saveStore` throws.

## Why it matters

Photo history is the one thing in the garden that cannot be re-entered by hand.
Losing it silently is the worst failure this app can have.

## Acceptance criteria

- [x] Native: a picked photo is copied into a `photos/` directory under the app's
      document directory before its row is written; the row stores a path
      relative to that directory
- [x] Existing rows pointing into the cache are migrated once: files that still
      exist are copied in, rows whose file is gone are reported (count) and kept
      so the user sees a placeholder rather than losing the entry silently
- [x] Deleting a photo deletes the owned copy
- [x] Web: photo data is stored in IndexedDB (or another store without the
      `localStorage` quota); the store row keeps only a key
- [x] Displaying a photo resolves the stored reference in one place (`lib/db.*`)
- [x] Tests cover path resolution and the migration decision logic; web storage
      is covered by the e2e photo test (036)

## Notes

Prerequisite for 020: a backup must know where photos live. Found while
preparing 020 on 2026-09-27; not yet reproduced on a device — 040 should check
that existing photos still display after this change.

Native uses the new `expo-file-system` API (`File`, `Directory`, `Paths`); the
legacy `deleteAsync` it replaced throws in SDK 55, so deleting a photo was
already broken on devices. `migratePhotosToAppStorage()` runs after `initDb()`,
is idempotent, and reports missing photos once (ids kept in an `app_meta` table).
Web photos live in IndexedDB behind `idb:<id>` refs. The native paths are unit-
and bundle-tested only; the on-device check is in 040.

Correction (2026-09-27): the web criterion was ticked wrongly. The picker hands
web a `blob:` URL, and that string — not the image bytes — is what went into
IndexedDB, so a web photo still dies on reload. The e2e test only checked the
date text. Fixed in 044.
