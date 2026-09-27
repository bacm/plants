---
id: 055
title: Keep the native iOS simulator checks in the repo with Maestro
status: open
priority: P2
type: chore
---

## Problem

On 2026-09-27 the app was driven for the first time in the iOS simulator (Expo
Go, iPhone 17, iOS 26) with Maestro: 8 native checks from 040 passed and ~100
screenshots were taken. The flows live in `/tmp/ux-ios/flows` and will be lost.

## Why it matters

The native code paths (SQLite, photo files, share sheet, native dialogs) have no
other automated coverage; `lib/db.js` cannot run under Jest and Playwright only
covers web.

## Acceptance criteria

- [ ] Maestro flows under `e2e/ios/` reproduce the 8 checks and seed a demo
      garden, using text and accessibility selectors (no coordinates)
- [ ] `npm run e2e:ios` boots a simulator, starts Metro on a free port, opens the
      app in Expo Go and runs the flows; documented in CLAUDE.md (requires Xcode,
      Maestro and a JDK — not in CI for now)
- [ ] A second run on a fresh simulator passes without manual steps

## Notes

Maestro 2.10 needs `JAVA_HOME` pointing at a JDK 17 (Homebrew `openjdk@17`).
