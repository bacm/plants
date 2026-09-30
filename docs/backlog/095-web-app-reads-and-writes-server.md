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
- [ ] Every request uses the session cookie (`credentials: 'include'`);
      photos are fetched with it and shown from a blob URL, since an `<img>`
      alone cannot prove the session cross-origin
- [ ] `npm run verify` and `npm run e2e:web` pass

## Notes

Depends on 092, 093, 097 (web site on its own subdomain), 098/100 (accounts)
and 101 (login screen). The web app is online only: no offline queue. No
credential is ever baked into the bundle (CLAUDE.md rule 2).
