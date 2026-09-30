---
id: 099
title: Let the admin approve, refuse and manage accounts
status: open
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

- [ ] Admin-only routes: list accounts by status, approve, refuse, disable,
      re-enable, reset password (returns a one-time temporary password),
      revoke all of an account's sessions and device tokens
- [ ] A non-admin account gets 403 on every admin route
- [ ] An "Administration" screen in Réglages, shown only to admins, lists
      pending requests first with their date, with Approuver / Refuser
- [ ] Refused pending requests older than 30 days are purged
- [ ] The same actions are available from the server command line
      (`python -m accounts …`), as a fallback
- [ ] pytest covers each route and the 403; `npm run verify` passes

## Notes

Depends on 098.
