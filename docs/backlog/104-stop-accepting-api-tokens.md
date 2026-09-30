---
id: 104
title: Stop accepting API_TOKENS on /search
status: blocked
priority: P2
type: security
---

## Problem

Since 098, `/search` still accepts a legacy `API_TOKENS` bearer so the app
installed on the owner's iPhone keeps working. Ticket 101 removed the token
field from Réglages and makes the app send its account device token, falling
back to the stored legacy token. A shared static token is a weaker credential
than an account.

## Why it matters

A leaked `API_TOKENS` value gives search access with no account, no
revocation per user and no per-account budget.

## Acceptance criteria

- [ ] The server no longer reads `API_TOKENS`: `/search` accepts an account
      credential only, and the server starts without the variable
- [ ] `API_TOKENS` is removed from `deploy.sh`, the deploy workflow, and the
      docs (`server/README.md`, `docs/DEPLOY-SERVER.md`)
- [ ] `getApiToken` / `setApiToken` and the legacy fallback in
      `lib/plantSearch.js` are removed from `lib/db.js`, `lib/db.web.js` and
      the app
- [ ] `npm run verify` and the server tests pass

## Notes

Blocked until the owner's iPhone runs the version of ticket 101 and is logged
in: removing the legacy token earlier would switch off plant search on that
phone.
