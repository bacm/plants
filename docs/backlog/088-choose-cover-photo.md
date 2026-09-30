---
id: 088
title: Choose a plant's cover photo
status: done
priority: P2
type: feature
---

## Problem

Every place that shows a plant's picture (plant hero, zone rows, dashboard,
bloom list) used the newest photo (`lib/db.js` `photoUri` subqueries,
`lib/db.web.js`, `app/plant/[id].js`). The owner could not pick a better one.

## Why it matters

The newest photo is often a close-up or a bare-winter shot; the owner wants
a representative "photo d'accueil".

## Acceptance criteria

- [x] New nullable `plants.coverPhotoId` column (`PLANT_FIELDS` + migration); backups without it still import
- [x] Cover is the chosen photo if it still exists and belongs to the plant, else the newest (SQL `PLANT_PHOTO_URI_SQL`, web `pickCoverPhoto`)
- [x] The plant lightbox has a toggle to choose / remove the cover; the Photos grid marks the cover with a star
- [x] Tests: `coverPhoto.test.js`, `db-web.test.js`, `backupFormat.test.js`, `e2e/cover-photo.spec.js`
- [x] `npm run verify` and `npm run e2e:web` pass

## Notes

No cleanup on photo delete/move: every lookup checks `photos.plantId`. The
native SQL path is not exercised under Jest. The mock-up (Claude Design
canvas) could not be updated from this session. `e2e/photo-swipe.spec.js` was
failing on main (date modal race); both specs now wait for the modal to close.
