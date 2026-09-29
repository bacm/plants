---
id: 076
title: Make the search server deployable on a VPS and require an access token
status: done
priority: P0
type: security
---

## Problem

`server/` only runs as a bare `uvicorn` command on a developer machine, and
`/search` accepts any caller: whoever finds the URL spends against the OpenAI
account, up to `SEARCH_DAILY_BUDGET` calls a day. A token cannot be shipped in
the app either — `EXPO_PUBLIC_*` values are readable in the bundle (CLAUDE.md
rule 2).

## Why it matters

019 (revoke the leaked key, deploy the server) is blocked partly because there
is nothing safe to deploy. Plant search does not work in a release build until
the server runs somewhere reachable.

## Acceptance criteria

- [x] `/search` requires `Authorization: Bearer <token>`, checked in constant
      time against `API_TOKENS` (comma-separated, each at least 32
      characters); a missing or wrong token gets 401 without calling OpenAI;
      `/health` stays open
- [x] The server refuses to start without `API_TOKENS` or with a short token
- [x] The app stores the token outside the bundle (iOS Keychain via
      expo-secure-store, localStorage on web), entered once in Réglages, and
      sends it with every search; a missing or refused token shows a message
      pointing to Réglages
- [x] `server/Dockerfile` plus `deploy/` (Docker Compose with Caddy for
      automatic HTTPS, the API port not published) run the server on a VPS
- [x] `docs/DEPLOY-SERVER.md` walks through a fresh VPS: firewall, DNS or
      sslip.io, `.env`, token generation, start, health check, update, token
      rotation
- [x] Server tests cover the auth cases; app tests cover the header and the
      new error kinds; `npm run verify` and the server tests pass

## Notes

Owner steps that stay in 019: revoking the old OpenAI key, the spend limit, the
VPS itself and setting `EXPO_PUBLIC_PLANT_API_URL` (a URL, not a secret) for
release builds. The rate limiter keys on the client IP, so uvicorn runs with
`--proxy-headers` behind Caddy.
