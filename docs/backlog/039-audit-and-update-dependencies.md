---
id: 039
title: Audit npm and Python dependencies and keep them current
status: done
priority: P2
type: chore
---

## Problem

No dependency audit has ever run. `server/requirements.txt` pins versions chosen
when the server was written (FastAPI 0.115.6), which already emit deprecation
warnings under Python 3.14. CI does not check for known vulnerabilities in
either ecosystem.

## Why it matters

The server is internet-facing, so a known vulnerability in FastAPI, Starlette or
httpx is directly exploitable. Silent drift also makes later upgrades bigger.

## Acceptance criteria

- [x] `npm audit --omit=dev` and `pip-audit` on `server/requirements.txt` run
      clean, or each remaining finding is recorded here with why it does not apply
- [x] Server pins are updated to current releases; server tests pass with no
      deprecation warnings from our own code
- [x] CI runs both audits and fails on high or critical findings
- [x] Automated update PRs (Dependabot or Renovate) are configured for npm, pip
      and GitHub Actions

## Notes

Expo SDK upgrades are their own project; this ticket only covers patch and minor
updates within the current SDK. Needs the GitHub remote working for the CI and
Dependabot parts.

`npx expo start` warns that 16 packages are behind the versions SDK 55 expects
(`expo` 55.0.4 vs ~55.0.31, `react-native` 0.83.2 vs 0.83.10, `expo-router`,
`expo-sqlite`, …). `npx expo install --fix` is the first step here.

Done on 2026-09-27. `npx expo install --fix` aligned 14 packages with SDK 55
(`expo` 55.0.31, `react-native` 0.83.10); `react-native-worklets` is pinned to
0.7.4 because reanimated's loose peer range otherwise resolves a version that
needs RN 0.86+. Server: fastapi 0.141.1, uvicorn 0.54.0, pytest 9.1.1, plus
pip-audit; `pip-audit` is clean.

Accepted `npm audit --omit=dev` findings (moderate, below the CI gate): 12
transitive advisories inside Expo's own tooling — uuid via xcode
(GHSA-w5hq-g745-h8pq) and decode-uri-component via query-string in
expo-router (GHSA-vcc3-ghjq-m6fr). The only fix is `--force`, which would
downgrade Expo out of SDK 55; revisit at the next SDK upgrade.
