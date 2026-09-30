---
id: 094
title: Sync the phone's garden with the server, offline first
status: open
priority: P2
type: feature
---

## Problem

The phone must keep working without network (at the bottom of the garden),
yet send its changes to the server and receive the web's changes.

## Why it matters

Without this client, edits made on the web never reach the phone and the
phone's edits never reach the web.

## Acceptance criteria

- [ ] A pure module (`lib/sync.js`) builds the push set (rows whose
      `updatedAt` is newer than the last successful push) and merges a pull
      (last write wins, soft deletes applied); Jest covers both
- [ ] Sync runs when the app opens, on pull-to-refresh, and a few seconds
      after a write; with no network it fails quietly and retries later
- [ ] Photos are uploaded after their row is pushed; photos pulled from the
      server are downloaded into the app's photo directory
- [ ] Réglages shows the sync state ("Synchronisé il y a 2 min", or the
      error) and a "Synchroniser maintenant" button
- [ ] A failed sync never loses a local change (tested with a push that fails
      halfway)
- [ ] `npm run verify` passes

## Notes

Depends on 091–093. It uses the server URL and the token already set in
Réglages for plant search. Rule 1 (await every promise) matters here: an
un-awaited push would silently mark rows as sent.
