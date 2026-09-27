---
id: 035
title: Back button does nothing after saving an edit or a care log
status: done
priority: P1
type: bug
---

## Problem

`app/plant/edit.js` and `app/plant/log.js` return to the plant with
`router.replace('/plant/<id>')`. After that, the "‹ Retour" button on
`app/plant/[id].js` calls `router.back()` and nothing happens: the URL and the
screen stay the same. The browser's own `history.back()` still works at that
point, so expo-router's stack no longer matches the history.

Found by `e2e/web-smoke.spec.js` (034), which fails at this step every run.

## Why it matters

`plant/[id]` sits outside the `(tabs)` group and has no tab bar, so after
editing a plant or logging care the user has no way back to the list except
reloading. Editing and logging are the two most common actions.

## Acceptance criteria

- [x] After saving an edit, "‹ Retour" returns to where the user opened the plant
- [x] Same after saving a care log
- [x] Opening a plant from a deep link (no history) still has a way back
- [x] `npm run e2e:web` passes
- [ ] ~~Checked on iOS or Android as well as web~~ — moved to 040

## Notes

Likely fix: save handlers use `router.back()` instead of `replace`, with the
detail screen refreshing on focus (it already uses `useFocusEffect`), and the
back button falls back to the zones tab when `router.canGoBack()` is false.

Cause: `replace()` put a second copy of the detail screen on top of the first,
so `back()` landed on the identical screen. Save handlers now call `back()`; the
detail screen reloads on focus. The back button falls back to the tabs when
there is no history.
