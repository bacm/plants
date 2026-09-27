---
id: 008
title: Define the plant field list once instead of five times
status: done
priority: P1
type: refactor
---

## Problem

The ~30 columns of a plant are written out by hand in five places:

| Location                               | Form                                           |
| -------------------------------------- | ---------------------------------------------- |
| `lib/db.js` `createPlant`              | column list + placeholder list + value list    |
| `lib/db.js` `updatePlant`              | the allowlist that was just removed (see 004)  |
| `lib/plantSearch.js` `normalizeToForm` | snake_case → camelCase mapping, twice          |
| `app/plant/new.js`                     | ~30 `useState` declarations + the save payload |
| `app/plant/edit.js`                    | the same ~30, plus the load-from-row mapping   |

`lib/db.web.js` `createPlant` is a sixth, partial copy.

## Why it matters

Adding one field means six coordinated edits. That is how `imageUrls` ended up
with a migration, a reader in `app/(tabs)/zones/index.js:69`, and no writer
anywhere (see 012). It is also why the web shim drifted (005) and why the
`updatePlant` allowlist felt expensive enough to delete (004).

This is the structural cause behind several other tickets rather than a defect of
its own.

## Acceptance criteria

- [x] One module declares each field once: name, SQL type, default, and how it maps
      to and from a form value
- [x] `createPlant` and `updatePlant` derive their column, placeholder and value
      lists from it
- [x] `normalizeToForm` derives its mapping from it
- [x] `new.js` and `edit.js` hold form state in a single object keyed by that
      definition, rather than ~30 separate `useState` calls
- [x] Adding a field to the definition requires no other edit than a migration
- [x] A test asserts the definition covers every column in the `plants` table

## Notes

Large, so it is worth doing in stages: the definition plus the `lib/db.js`
consumers first (that alone unblocks 004 and 012), then `normalizeToForm`, then the
two screens. Each stage is independently shippable.

Do not start this in the same change as a bug fix.
