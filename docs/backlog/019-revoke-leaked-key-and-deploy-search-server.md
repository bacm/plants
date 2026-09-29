---
id: 019
title: Revoke the leaked OpenAI key and deploy the search server
status: blocked
priority: P0
type: security
---

## Problem

001 moved the OpenAI key out of the app into `server/`, but the key that was
inlined into earlier builds is still valid, and the server does not run anywhere
yet — `EXPO_PUBLIC_PLANT_API_URL` has nothing to point at outside development.

## Why it matters

Anyone holding an earlier build can still extract the key and spend against the
account. Until the server is deployed, plant search does not work in a release
build.

## Acceptance criteria

- [x] The old key is revoked at platform.openai.com and a new one issued
- [x] The new key exists only in the server's environment
- [x] A hard monthly spend limit is set in the OpenAI dashboard (from 037)
- [x] The server is deployed with `--proxy-headers` if behind a reverse proxy
- [ ] Release builds set `EXPO_PUBLIC_PLANT_API_URL` to the deployed URL
- [x] Every build published before 001 is treated as compromised

## Notes

Blocked on the owner: revocation needs the OpenAI account, and the hosting choice
is theirs. Since 076 the server ships as a Docker Compose stack behind Caddy
with an access token on `/search`; `docs/DEPLOY-SERVER.md` covers the VPS side
(Caddy already forwards the client IP, uvicorn runs with `--proxy-headers`). The rate limit is in memory and per process — fine for one instance;
revisit if the server scales out.

2026-09-29: the old key is revoked and the new one lives only in the GitHub
`production` environment (`OPENAI_API_KEY`), written to the VPS by the 079
workflow; the deploy of `801e329` runs with it at `https://plants.bacm.me`.
With the old key revoked, builds from before 001 can no longer spend. `.env`
points `EXPO_PUBLIC_PLANT_API_URL` at that URL; a release build still has to
be installed to confirm it.
Spend is capped by a prepaid balance of 10 EUR on the OpenAI account, which
holds only while auto-recharge stays off.
