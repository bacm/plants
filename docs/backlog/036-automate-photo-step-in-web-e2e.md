---
id: 036
title: Cover adding a photo in the web end-to-end test
status: open
priority: P3
type: chore
---

## Problem

034's acceptance included adding a photo, but `e2e/web-smoke.spec.js` skips it:
the photo flow opens the system picker (`expo-image-picker`), which Playwright
cannot drive as is.

## Why it matters

Photos are a core feature and the web shim changed how photo dates are stored
(005). The step is currently verified by nobody.

## Acceptance criteria

- [ ] The e2e test adds a photo to the plant, with a chosen date, and sees it in
      the photos tab after a reload
- [ ] No test-only code path in the app beyond accessibility labels or testIDs

## Notes

On web the picker is a file input; Playwright's `setInputFiles` may be enough
once the control is reachable. Pairs with 027 (accessibility labels).
