---
id: 099
title: Let the admin approve, refuse and manage accounts
status: done
priority: P2
type: feature
---

## Problem

Accounts from 098 start pending. The owner needs a place to see requests and
approve or refuse them, and to disable an account or reset a password later.

## Why it matters

Without it, nobody but the first admin can ever use the app, and a lost
password locks its owner out for good.

## Acceptance criteria

- [x] Admin-only routes: list accounts by status, approve, refuse, disable,
      re-enable, reset password (returns a one-time temporary password),
      revoke all of an account's sessions and device tokens
- [x] A non-admin account gets 403 on every admin route
- [x] An "Administration" screen in Réglages, shown only to admins, lists
      pending requests first with their date, with Approuver / Refuser
- [x] Refused pending requests older than 30 days are purged
- [x] The same actions are available from the server command line
      (`python -m accounts …`), as a fallback
- [x] pytest covers each route and the 403; `npm run verify` passes

## Notes

Depends on 098.
