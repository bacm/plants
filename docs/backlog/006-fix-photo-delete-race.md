---
id: 006
title: Deleting a photo does not refresh the screen
status: done
priority: P1
type: bug
---

## Problem

`app/plant/[id].js:231`:

```js
onPress: async () => { deletePhoto(photo.id); await load(); }
```

`deletePhoto` is `async` — it awaits `FileSystem.deleteAsync` before issuing the
`DELETE`. Because the call is not awaited, `load()` re-reads the table while the
row is still there.

## Why it matters

The user long-presses a photo, confirms deletion, and the photo is still on screen.
It disappears only after a manual pull-to-refresh, which reads as a broken app.

## Acceptance criteria

- [x] `deletePhoto` is awaited before `load()`
- [x] The cover photo path (`app/plant/[id].js`, hero long-press) is checked too —
      it shares the same handler
- [x] Every other call to an `async` `lib/db` function in `app/` is audited for the
      same shape and awaited

## Notes

The sibling call at `:245` (`deletePlant(id); router.replace(...)`) is fine —
`deletePlant` is synchronous. Worth confirming rather than assuming while auditing.

Audit (2026-09-27): the async exports of `lib/db.js` are `getPlantById`,
`markReminderDone`, `deletePhoto` and `getZoneContextInfo`. Every call site in
`app/` is awaited, `Promise.all`'d, or a deliberate `.then` setter in an effect.
