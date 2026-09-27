---
id: 012
title: The imageUrls column is read but never written
status: done
priority: P2
type: bug
---

## Problem

The column exists and is read, but nothing writes it:

- `lib/db.js:86` adds `plants.imageUrls` via migration
- `app/(tabs)/zones/index.js:69` reads it and `JSON.parse`s it to pick a thumbnail
- `lib/db.js:521` selects it in `getPlantsByZoneWithImages`
- `lib/plantSearch.js:134` returns `image_urls` from the search
- `normalizeToForm` (`lib/plantSearch.js:233`) drops the field
- `createPlant` and `updatePlant` never mention it

## Why it matters

When a plant is added from an AI search result, its images are fetched, carried as
far as `normalizeToForm`, and discarded. The zones screen falls back to a leaf
emoji for every plant that has no user-taken photo, and the reader at
`zones/index.js:69` is permanently dead code.

## Acceptance criteria

One of the two:

**Option A — persist them**
- [x] `normalizeToForm` keeps `image_urls`
- [x] `createPlant` and `updatePlant` write `imageUrls` as JSON
- [x] The zones thumbnail actually renders a remote image — code path in place;
      the on-screen check needs the search server and moves to 040
- [x] Depends on 013: today's URLs are fabricated and would mostly 404

**Option B — remove the column**
- [ ] `imageUrls` is dropped from the migration and from every `SELECT`
- [ ] The reader in `app/(tabs)/zones/index.js` and its `getPlantImage` helper go
- [ ] `lib/plantSearch.js` stops returning `image_urls`

## Notes

Option A only makes sense after 013 supplies real image URLs, and both depend on
the outcome of 001 (whether the AI lookup survives at all). Sequence:
001 → 013 → this.

Resolved with option A. `imageUrls` is an ordinary field in `lib/plantFields.js`
(stored as JSON, https only, parsed once by `parseImageUrls`). The zones
thumbnail and the plant hero show it when the user has no photo of their own.
