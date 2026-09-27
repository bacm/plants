---
id: 005
title: Decide whether web is a supported target, then make db.web.js match
status: open
priority: P1
type: chore
---

## Problem

`lib/db.web.js` is missing seven names that `lib/db.js` exports and that screens
import: `deleteCareLog`, `getPlantsByZoneWithImages`, `getZoneContextInfo`,
`SOIL_TYPES`, `SOIL_PH`, `PROPAGATION`, `TOXICITY`.

On web this bundles cleanly and then fails at runtime:

- the Zones tab throws (`getPlantsByZoneWithImages is not a function`)
- `/plant/new` and `/plant/edit` throw while rendering (`SOIL_TYPES.map` of
  `undefined`)
- deleting a care log throws

Beyond the missing names, `createPlant` on web writes 12 of the ~30 columns and
`createZone` drops `icon`, so data entered on web is silently incomplete.

## Why it matters

`README.md` says storage is "not available on web as is", but the shim exists and
is half-wired, which is worse than absent: the app looks like it works and loses
data. Either state is defensible; the current one is not.

## Acceptance criteria

One of the two:

**Option A — support web**
- [ ] All seven names exist in `lib/db.web.js` with equivalent behaviour
- [ ] `createPlant` and `createZone` persist every column the native version does
- [ ] `KNOWN_WEB_GAPS` in `lib/__tests__/db-parity.test.js` is empty and the test
      passes
- [ ] Zones, plant create and plant edit verified in a browser

**Option B — drop web**
- [ ] `lib/db.web.js` is deleted
- [ ] `web` is removed from `package.json` scripts and from `app.json`
- [ ] The bundle step in `.github/workflows/ci.yml` stops building web
- [ ] `README.md` says web is unsupported, without qualification
- [ ] `lib/__tests__/db-parity.test.js` is deleted along with its `KNOWN_WEB_GAPS`

## Notes

The app ships to iOS (`deploy-iphone.sh`, `ios/` present). Web looks like it was
scaffolding. Option B is likely correct and is roughly ten minutes of work; Option
A is a few hours and an ongoing maintenance tax on every schema change.

Until this is decided, `KNOWN_WEB_GAPS` keeps the gap from widening: adding a new
native export without a web twin fails the test.
