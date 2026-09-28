---
id: 055
title: Keep the native iOS simulator checks in the repo with Maestro
status: done
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

- [x] Maestro flows under `e2e/ios/` reproduce the 8 checks and seed a demo
      garden, using text and accessibility selectors (no coordinates)
- [x] `npm run e2e:ios` boots a simulator, starts Metro on a free port, opens the
      app in Expo Go and runs the flows; documented in CLAUDE.md (requires Xcode,
      Maestro and a JDK — not in CI for now)
- [x] A second run on a fresh simulator passes without manual steps

## Notes

Maestro 2.10 needs `JAVA_HOME` pointing at a JDK 17 (Homebrew `openjdk@17`).

Two consecutive full runs passed 8/8 (13 min each) on 2026-09-28. Selectors are
text and accessibility labels (one label added: `Photo du <date>` on photo
thumbnails); the only coordinates left are two percentage swipes (a nested
horizontal month row, and dismissing the iOS share sheet). Maestro text
selectors are regular expressions: escape `+ * ( ) .` in labels. Expo Go's
dev-menu sheet can appear mid-flow; `_dismiss-dev-menu.yaml` handles it.
