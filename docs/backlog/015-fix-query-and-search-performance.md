---
id: 015
title: Zones screen serialises its queries and library search has no debounce
status: done
priority: P3
type: chore
---

## Problem

**Zones.** `app/(tabs)/zones/index.js:90` loads each zone's data in a sequential
`for … await` loop, two queries per zone:

```js
for (const zone of z) {
  plants[zone.id] = await getPlantsByZoneWithImages(zone.id);
  contexts[zone.id] = await getZoneContextInfo(zone.id);
}
```

`getZoneContextInfo` itself runs three more queries, so a garden with 8 zones costs
32 round trips, strictly one after another, on every focus of the tab.

**Library.** `app/(tabs)/library.js:28` has `search` in the `useCallback`
dependency list and `load` in a `useFocusEffect`, so every keystroke issues a fresh
`SELECT … LIKE` with no debounce.

## Why it matters

Both are invisible on a small database and get worse exactly as the app becomes
useful. Neither is urgent; both are cheap to fix while the code is fresh.

## Acceptance criteria

- [x] Zone data loads concurrently (`Promise.all`) or in one aggregate query
- [x] `getZoneContextInfo`'s three queries run concurrently
- [x] Library search is debounced (~250ms) and an in-flight query is not raced by
      its successor
- [x] Behaviour is unchanged: same results, same ordering

## Notes

An aggregate query is the better fix for the zones screen but a larger change. The
`Promise.all` version is a few lines and captures most of the benefit — prefer it
unless the aggregate falls out naturally from 008.
