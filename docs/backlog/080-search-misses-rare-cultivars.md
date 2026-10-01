---
id: 080
title: Plant search does not know rare cultivars such as Rosier La Fraîcheur
status: done
priority: P2
type: feature
---

## Problem

`server/app.py` `call_openai` asks `gpt-4o-mini` to answer from memory, with no
web access, and `build_prompt` asks for a list of plants matching the query.
A cultivar the model has not memorised — the owner hit "rosier La Fraîcheur" —
comes back unknown or as a generic rose, with nothing telling the user so.

## Why it matters

Named cultivars are most of what a garden holds. When search misses one, the
user either picks a wrong plant, whose bloom months and care then feed
reminders, or types every field by hand.

## Acceptance criteria

- [x] After a search, the form offers "Recherche approfondie", also when the
      search found nothing; it reruns the same query with a stronger model
- [x] The app sends only `precise: true`; the model names are fixed in
      `server/app.py`, so a client cannot pick an arbitrary model
- [x] ~~A normal search still uses `gpt-4o-mini` with unchanged parameters; a
      precise one uses `gpt-5.5` with the parameters that model accepts~~
      Superseded by 103: every search now uses `gpt-5.5`
- [x] Server and app tests cover the new field; `npm run verify`, the server
      tests and `npm run e2e:web` pass

## Notes

Owner's choice on 2026-09-29: switch to a stronger model on demand rather than
always, the app having a single user for now. `gpt-5.5` costs $5 / $30 per 1M
tokens against about $0.15 / $0.60 for `gpt-4o-mini`, so a precise search costs
a few cents, against a 10 EUR prepaid balance. Both count as one call against
`SEARCH_DAILY_BUDGET`. Web search grounding (Responses API) stays an option if
the stronger model still misses cultivars.

Superseded on 2026-09-30 by 103 (owner: always the strongest model, no
"Recherche approfondie" button). The two-model split this ticket describes no
longer exists, so its last criterion cannot and need not be met.
