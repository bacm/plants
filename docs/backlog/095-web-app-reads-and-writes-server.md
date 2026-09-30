---
id: 095
title: Make the web app read and edit the server's garden
status: in-progress
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

- [ ] The web app keeps `lib/db.web.js`'s local store as a cache of the
      signed-in account's garden, and syncs it with the server through the
      same engine as the phone (`lib/sync.js`), authenticated by the session
      cookie; `db-parity.test.js` passes and no screen changes
- [ ] Signing in (or a different account than the cached one) empties the
      local cache, then pulls the account's garden; signing out empties it
- [ ] Sync runs on load, when the tab becomes visible again and a few seconds
      after a local write; on the web there is no "première synchronisation"
      step: the server holds the reference copy
- [ ] Photos are not all downloaded: a photo is fetched from
      `GET /photos/{id}` with the cookie when displayed and shown from a blob
      URL (kept in memory while the page lives); a photo added on the web is
      stored locally then uploaded by the sync
- [ ] An edit made on the web appears on the phone after its next sync, and
      the reverse (checked by hand, steps noted in the commit)
- [ ] With the server unreachable, the web app says so instead of silently
      showing a stale or empty garden
- [ ] `npm run verify` and `npm run e2e:web` pass

## Notes

Depends on 092, 093, 097 (web site on its own subdomain), 098/100 (accounts)
and 101 (login screen). Design changed on 2026-09-30: instead of rewriting every db.web.js query as
a server call, the web reuses the phone's sync engine over its local store,
which becomes a cache emptied at sign-in and sign-out. No
credential is ever baked into the bundle (CLAUDE.md rule 2).
