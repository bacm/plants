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

- [ ] The old key is revoked at platform.openai.com and a new one issued
- [ ] The new key exists only in the server's environment
- [ ] The server is deployed with `--proxy-headers` if behind a reverse proxy
- [ ] Release builds set `EXPO_PUBLIC_PLANT_API_URL` to the deployed URL
- [ ] Every build published before 001 is treated as compromised

## Notes

Blocked on the owner: revocation needs the OpenAI account, and the hosting choice
is theirs. The rate limit is in memory and per process — fine for one instance;
revisit if the server scales out.
