---
id: 100
title: Keep each account's garden and photos separate on the server
status: open
priority: P1
type: security
---

## Problem

The sync store (092) keys rows by (table, id) and photos (093) by id alone,
for a single shared garden. With one garden per user (098), one account must
never read, overwrite or delete another's rows or photos.

## Why it matters

A missing account filter would leak or destroy someone else's garden.

## Acceptance criteria

- [ ] Stored rows are keyed by (account, table, id); push and pull only see
      the caller's rows; revisions stay monotonic per account
- [ ] Photo files live under a per-account directory; the photo routes
      (`PUT` and `GET /photos/{id}`) only find the caller's row and file
- [ ] The same id pushed by two accounts creates two independent rows
- [ ] A per-account quota on photo storage (default 5 GB, env setting);
      beyond it `PUT` answers 507
- [ ] `/search` daily budget is also counted per account
- [ ] pytest: account A cannot pull, overwrite, delete or download
      anything of account B, for each route

## Notes

Depends on 098. The server was never deployed with 092/093, so there is no
existing data to migrate: the tables can change shape freely.
