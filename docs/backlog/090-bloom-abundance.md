---
id: 090
title: Record how abundantly a plant blooms
status: done
priority: P2
type: feature
---

## Problem

A plant's bloom is only a period (`bloomStartMonth`/`bloomEndMonth`). A maple
flowers insignificantly, a rose abundantly, yet both fill the bloom views and
the garden's bloom coverage the same way.

## Why it matters

The bloom tab's year view hides gaps: a month covered only by a maple's
inconspicuous flowers looks like a flowering month.

## Acceptance criteria

- [x] New `bloomAbundance` plant field (insignificant / moderate / abundant /
      unknown) in `lib/enums.js`, `lib/plantFields.js`, a `lib/db.js` migration
- [x] Old backups without the key import as unknown (`backupFormat.test.js`)
- [x] `bloomCoverage` and `bloomGaps` ignore insignificant blooms
      (`bloomCoverage.test.js`)
- [x] `getPlantsBloomingInMonth` lists insignificant blooms last on both
      platforms (`db-web.test.js`); bloom tab and dashboard dim them
- [x] Plant form has an "Abondance" chip row; the plant sheet shows the label
- [x] The search prompt asks for `bloom_abundance`; `searchResultToForm` maps an
      invalid value to unknown (server and Jest tests)
- [x] `npm run verify` passes

## Notes

Owner decisions: three levels plus unknown; insignificant blooms stay visible
but go last, dimmed, and do not count in coverage. Mock-up sync is in 089.
