---
id: 095
title: Make the web app read and edit the server's garden
status: open
priority: P2
type: feature
---

## Problem

The web build keeps its own separate garden in localStorage and IndexedDB
(`lib/db.web.js`, `lib/webPhotoStore.js`), so it never shows what the phone
recorded.

## Why it matters

The owner wants a web app that shows and edits the same garden as the phone,
for example to trace the garden plan on a big screen.

## Acceptance criteria

- [ ] `lib/db.web.js` reads and writes through the server's sync endpoints
      instead of localStorage; it keeps the same exports, so no screen changes
      (`db-parity.test.js` passes)
- [ ] Photos are shown from `GET /photos/{id}` and added with
      `PUT /photos/{id}`
- [ ] An edit made on the web appears on the phone after its next sync, and
      the reverse (checked by hand, steps noted in the PR)
- [ ] With the server unreachable, the web app shows an error instead of an
      empty garden
- [ ] The web build is served by Caddy behind a password
      (`docs/DEPLOY-SERVER.md`), and the web origin is in `ALLOWED_ORIGINS`
- [ ] `npm run verify` and `npm run e2e:web` pass

## Notes

Depends on 092 and 093. The web app is online only: no offline queue. The
bearer token is entered in Réglages, as on the phone, and never baked into the
bundle (CLAUDE.md rule 2).
