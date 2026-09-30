---
id: 092
title: Store the garden on the server with push and pull sync endpoints
status: open
priority: P2
type: feature
---

## Problem

`server/app.py` only proxies plant search; it stores nothing. The garden needs
one place that every device syncs with.

## Why it matters

Without a server copy, the phone and the web app each have their own garden.
The server copy also becomes an off-phone backup.

## Acceptance criteria

- [ ] The server keeps the garden in SQLite on a Docker volume (the path is
      documented in `docs/DEPLOY-SERVER.md`, backups included)
- [ ] `POST /sync/push` accepts changed rows per table. Each row is kept only
      if its `updatedAt` is newer than the stored one (last write wins); each
      accepted row gets a server revision number
- [ ] `GET /sync/pull?since=<revision>` returns every row changed after that
      revision, deleted rows included, plus the latest revision
- [ ] Table and column names come from a fixed allow-list; an unknown one is
      rejected with 400, never interpolated into SQL (CLAUDE.md rule 5)
- [ ] Both endpoints require a bearer token from `API_TOKENS`, like `/search`
- [ ] pytest covers push, pull, last-write-wins, soft delete, an unknown
      column and a missing token

## Notes

Depends on 091. The allow-list should come from the same field list as the
app (`lib/plantFields.js`), or a test should fail if they drift apart.
Last-write-wins on the device clock is enough for a single owner.
