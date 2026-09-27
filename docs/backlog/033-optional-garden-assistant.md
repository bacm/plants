---
id: 033
title: Optional assistant that answers questions about this garden
status: open
priority: P3
type: feature
---

## Problem

The only AI feature is plant lookup by name (`server/`, `lib/plantSearch.js`).
The user cannot ask a question that depends on their own garden, such as "what
could I plant for August flowers in my shaded bed?".

## Why it matters

Generic plant apps answer generically. An assistant that knows the garden's
zones, exposure, bloom gaps and existing colours gives answers no competitor can.
It is also the most expensive feature to run, hence optional.

## Acceptance criteria

- [ ] The assistant is off by default and enabled from settings; when off, no
      entry point is shown and no garden data leaves the device
- [ ] Enabling it says plainly which data is sent to the server and to the model
      provider
- [ ] The app is fully usable with it disabled, or when the server is unreachable
- [ ] Questions go through a new `server/` endpoint; the model key stays on the
      server (CLAUDE.md rule 2); the endpoint is rate-limited like `/search`
- [ ] The app sends a compact garden summary (zones, plants, exposure, bloom
      months, colours), never photos or notes unless the user attaches them
- [ ] Answers that suggest plants can add one to the garden through the existing
      new-plant form
- [ ] The garden-summary builder is a pure function with tests; server tests mock
      the model

## Notes

Cost control matters more than for search: cap tokens per answer and questions
per day per device. Model choice is open; the proxy makes switching provider a
server-only change.
