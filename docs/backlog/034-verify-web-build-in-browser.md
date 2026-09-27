---
id: 034
title: Verify the web build end to end in a browser
status: open
priority: P2
type: chore
---

## Problem

005 brought `lib/db.web.js` to parity with `lib/db.js` and covers it with unit
tests (`lib/__tests__/db-web.test.js`), but nobody has used the web build in a
browser since: Playwright is not installed in the development environment.

## Why it matters

Unit tests on the storage shim do not prove the screens render and behave on web
(layout, pickers, image handling differ per platform).

## Acceptance criteria

- [ ] `npx expo start --web`: create a zone, create a plant in it, edit the plant,
      add a care log and a photo, and open the zones tab — no console errors
- [ ] Reloading the page keeps everything created
- [ ] Any defect found becomes its own ticket

## Notes

Can be done by hand in a few minutes. Automating it (Playwright as a dev
dependency, a smoke script in CI) is a separate decision.
