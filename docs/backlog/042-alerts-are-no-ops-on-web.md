---
id: 042
title: Alerts and confirmations do nothing on web
status: done
priority: P1
type: bug
---

## Problem

Every dialog in the app goes through React Native's `Alert.alert`. On web,
react-native-web implements it as an empty function
(`react-native-web/src/exports/Alert/index.js`: `static alert() {}`). So on web:

- adding a photo never opens the picker — the camera/gallery choice is an Alert
  (`app/plant/[id].js`, `showAddPhotoOptions`)
- deleting a photo, a plant or a zone never happens — the confirmation is an Alert
- every write error surfaced by 010 is invisible

Found by the photo step of the web e2e test (036).

## Why it matters

Web is a supported target (005). On web, a user cannot add a photo or delete
anything, and failures are silent — the exact situation 010 was meant to end.

## Acceptance criteria

- [x] One module owns dialogs: an information alert, a yes/no confirmation, and a
      choice among options, each working on iOS, Android and web
- [x] Every `Alert.alert` in `app/` and `components/` goes through it
- [x] ESLint forbids importing `Alert` from `react-native` outside that module
- [x] On web, adding a photo opens the file picker directly (no camera choice)
- [x] The web e2e test ~~adds a photo and~~ deletes something through a
      confirmation (the photo step is 036, done right after)
- [x] The module's platform branches are unit-tested

## Notes

`window.confirm` / `window.alert` are enough on web; a styled modal is a later
nicety, not part of this fix.

`lib/dialogs.js` exposes `showMessage`, `confirm` and `choose`; 16 call sites in 8
files use it, and `no-restricted-imports` keeps `Alert` out of everything else.
