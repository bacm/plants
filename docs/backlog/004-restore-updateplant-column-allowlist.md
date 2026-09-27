---
id: 004
title: updatePlant interpolates caller-supplied keys into SQL
status: done
priority: P1
type: refactor
---

## Problem

An uncommitted change to `lib/db.js:301` replaced the explicit column allowlist
with a loop over the keys of the `updates` object:

```js
for (const key in updates) {
  set.push(`${key} = ?`); // key becomes a column name, unvalidated
}
```

`lib/db.web.js:126` received the same change and now lets any property onto the
stored object.

## Why it matters

Nothing is exploitable today — every call site passes a literal object. But the
allowlist was the guard that stopped a caller from turning a user-controlled key
into a column name, and it was also the only written record of which columns are
writable. Both are gone.

Values are still parameterised, so this is not an injection hole right now; it is
the removal of the barrier that keeps it from becoming one.

## Acceptance criteria

- [x] `updatePlant` validates every key against an explicit field list before it
      reaches the `SET` clause, and ignores or rejects unknown keys
- [x] `lib/db.web.js` applies the same validation
- [x] The field list is not a fourth hand-maintained copy — it comes from the
      shared definition in 008, or 008 lands first
- [x] A test asserts that an unknown key is rejected

## Notes

If the motivation was that the list was tedious to keep in sync with
`createPlant`, that is exactly what 008 fixes. Prefer sequencing 008 before this.
