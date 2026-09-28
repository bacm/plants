---
id: 062
title: The camera screen cannot be closed on iOS
status: open
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
- [ ] Root cause identified and fixed; "✕" returns to the previous screen and
      "Galerie" opens "À trier"
- [ ] Flow 09 asserts the screen after closing; flow 10 is re-enabled in
      `e2e/ios/config.yaml` and passes

## Notes

Found by 061. Try: unmounting the `CameraView` before navigating, a plain stack
screen instead of `fullScreenModal`, and checking `react-native-screens` issues
for SDK 55.
