---
id: 062
title: The camera screen cannot be closed on iOS
status: in-progress
priority: P1
type: bug
---

## Problem

In the iOS simulator (iPhone 17, iOS 26, Expo Go), leaving `app/capture.js`
does nothing: neither "✕" (`router.replace`) nor the "Galerie" button
navigates away. Reproduced with capture.js as of 056 (before 061), after
`simctl erase` and a fresh Expo Go install, with push, replace and back.
Suspected: an interaction between `CameraView` and `react-native-screens` in a
full-screen modal. Flow 09 never asserted what happens after closing, so it was
not caught in 056.

## Why it matters

If it happens on a device, the user is stuck in the camera and must kill the
app — on the feature meant to be used daily.

## Acceptance criteria

- [ ] Reproduced (or ruled out) on a real iPhone (040)
- [x] Root cause identified and fixed; "✕" returns to the previous screen and
      "Galerie" opens "À trier"
- [x] Flow 09 asserts the screen after closing; flow 10 is re-enabled in
      `e2e/ios/config.yaml` and passes

## Notes

Found by 061. Try: unmounting the `CameraView` before navigating, a plain stack
screen instead of `fullScreenModal`, and checking `react-native-screens` issues
for SDK 55.

## Resolution

Not a navigation bug: the top bar sat at a fixed `paddingTop: 32`, under the
iOS status bar (about 62 pt on an iPhone 17), and taps there never reached
"✕" or "Galerie". The bar is now offset by the safe-area inset. "✕" lands
on the dashboard, by design (see `close()` in `app/capture.js`).

Flow 09 also needed its seed fixed: `_seed-lavande.yaml` tapped the bloom
period's month cell instead of "Mois de taille", so Lavande was never saved.
Flow 08, which shares that seed, still fails on "Tailler · Lavande": see 127.
Flows 09 and 10 pass on the iPhone 17 simulator (iOS 26).
