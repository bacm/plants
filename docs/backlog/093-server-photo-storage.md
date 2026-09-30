---
id: 093
title: Upload and serve photos from the server
status: done
priority: P2
type: feature
---

## Problem

Photos are files in the app's document directory (`lib/db.js`,
`photosDirectory()`) on the phone and data URLs in IndexedDB on the web
(`lib/webPhotoStore.js`). A synced `photos` row would point to a file that
exists on one device only.

## Why it matters

Photos are most of the app's value (history, sorting, cover photo). A web app
that shows a plant without its photos is not usable.

## Acceptance criteria

- [x] `PUT /photos/{id}` stores the image (JPEG, PNG, HEIC or WebP, the
      app's `SAFE_EXTENSIONS`; size capped, type checked against the bytes)
      under the photo's UUID, only for a known, non-deleted photo row;
      uploading the same id twice is a no-op
- [x] `GET /photos/{id}` returns it, with long-lived cache headers
- [x] Both routes require a bearer token from `API_TOKENS`
- [x] A photo whose row is soft-deleted is removed from disk on the next pull
      or by a cleanup task
- [x] pytest covers upload, download, the size cap, the wrong type and a
      missing token

## Notes

Depends on 092. Photos are already downscaled to 2048 px before storage
(`lib/photoPipeline.js`), so the server does not need to resize them. A
thumbnail size can be a later ticket if the web grid is slow.
