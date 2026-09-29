---
id: 080
title: Plant search does not know rare cultivars such as Rosier La Fraîcheur
status: open
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

- [ ] "rosier La Fraîcheur" returns that cultivar, or the closest species
      clearly marked as such, with the cultivar name kept
- [ ] The answer says when the data is the species' rather than the
      cultivar's, and the app shows it
- [ ] Cost per search stays within the 10 EUR prepaid balance at the current
      `SEARCH_DAILY_BUDGET`
- [ ] Server tests cover the new behaviour; `npm run verify` and the server
      tests pass

## Notes

Options, not yet decided: a stronger model; OpenAI's web search tool (Responses
API), which grounds cultivar answers but costs more per call; or a prompt that
falls back to the species and keeps the typed cultivar name. Found on
2026-09-29 while closing 019.
