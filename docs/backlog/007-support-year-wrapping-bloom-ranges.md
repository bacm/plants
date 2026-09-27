---
id: 007
title: Bloom periods that wrap the year never match
status: done
priority: P1
type: bug
---

## Problem

Every bloom query uses the same comparison:

```sql
bloomStartMonth <= ? AND bloomEndMonth >= ?
```

For a plant blooming November to February (`start = 11`, `end = 2`) there is no
month `m` where `11 <= m AND 2 >= m`. It matches nothing, ever.

Affected: `getPlantsBloomingInMonth` (`lib/db.js:474`), the `bloomMonth` filter in
`getPlants` (`lib/db.js:211`), and the mirrored logic in `lib/db.web.js:82`.

## Why it matters

Winter-flowering plants — hellebore, camellia, winter jasmine, mahonia — are
invisible in the Bloom tab and absent from the dashboard's "En fleurs ce mois"
section for every month of the year. The data is entered correctly and silently
ignored.

## Acceptance criteria

- [x] A month matches when `start <= end ? (m >= start && m <= end) : (m >= start || m <= end)`
- [x] The rule is implemented once, not repeated at each of the three query sites
- [x] `lib/db.web.js` uses the same rule
- [x] Tests cover a normal range (May–July), a wrapping range (Nov–Feb), a
      single-month range (`start === end`), and a plant with no bloom months

## Notes

The comparison is a good candidate for a pure helper in a shared module, which
makes it testable without SQLite — see the note in CLAUDE.md about extracting logic
out of `lib/db.js`.

The SQL form of the wrapping case is
`(bloomStartMonth <= bloomEndMonth AND ? BETWEEN bloomStartMonth AND bloomEndMonth) OR (bloomStartMonth > bloomEndMonth AND (? >= bloomStartMonth OR ? <= bloomEndMonth))`.
