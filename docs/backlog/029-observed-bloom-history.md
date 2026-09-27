---
id: 029
title: Record when plants actually bloom and compare year over year
status: open
priority: P2
type: feature
---

## Problem

Bloom periods are declared months (`bloomStartMonth`/`bloomEndMonth`), copied
from search results or typed once. Nothing records when a plant really flowered
in this garden.

## Why it matters

Real bloom dates vary with microclimate and year. A garden-specific record is
information no generic database has, and "your peonies bloomed 12 days earlier
than last year" is a reason to open the app that competitors do not offer.

## Acceptance criteria

- [ ] From the plant detail and the dashboard, one tap records "en fleur
      aujourd'hui"; a second action records the end of flowering
- [ ] The plant detail shows each year's observed bloom window and the shift
      against the previous year, in days
- [ ] The bloom tab can show observed windows alongside declared months
- [ ] The dashboard surfaces a memory when relevant ("Il y a un an, vos pivoines
      fleurissaient"), at most one per day
- [ ] Observations are stored in their own table with a migration; db.js and
      db.web.js stay in parity
- [ ] Year-over-year comparison is a pure function with tests (including a
      window that spans New Year)

## Notes

Optionally, after two seasons, offer to update the declared months from
observations — never automatically. Pairs with 024 (year overview) and 030
(photos of the bloom).
