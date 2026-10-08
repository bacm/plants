---
id: 029
title: Record when plants actually bloom and compare year over year
status: done
priority: P1
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

- [x] From the plant detail, one tap records "en fleur aujourd'hui"; a second
      action records the end of flowering (the dashboard part moved to 128)
- [x] The plant detail shows each year's observed bloom window and the shift
      against the previous year, in days
- [x] A mark made by mistake today can be undone
- [x] Observations are stored in their own table with a migration; db.js and
      db.web.js stay in parity (056)
- [x] Year-over-year comparison is a pure function with tests (including a
      window that spans New Year)

## Notes

Optionally, after two seasons, offer to update the declared months from
observations — never automatically. Pairs with 024 (year overview) and 030
(photos of the bloom).

Raised with 056: "En fleur" is a one-tap tag on quick capture, and memories
feed the home screen (058). Together they are the core of the return loop.

Storage done in 056: `bloom_observations` (plantId, date, kind 'open'),
written by the camera's "En fleur". Left here: recording the end of bloom, the
year-over-year comparison, memories, and the observed band in the bloom view.

Split on 2026-10-08: the observed band in the bloom tab moved to 129 (with
074), the dashboard tap and the memories to 128 (with 058).
