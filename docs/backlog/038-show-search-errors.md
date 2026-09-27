---
id: 038
title: Tell the user when plant search fails instead of showing no results
status: open
priority: P2
type: bug
---

## Problem

`searchPlants` in `lib/plantSearch.js` catches every error, logs it and returns
`[]`. A missing server URL, a network failure, a 429 from the rate limit or a
502 from OpenAI all render as "no results" in `app/plant/new.js` and `edit.js`.

## Why it matters

The user retypes the query or assumes the plant is unknown, when the real answer
is "try again in a minute" or "the service is down". It also hides the missing
server in release builds (019).

## Acceptance criteria

- [ ] `searchPlants` distinguishes "no results" from "search failed" (throws, or
      returns a result object — decide in the plan)
- [ ] Both screens show a short French message for failures, distinct for rate
      limit, service unavailable, and no network
- [ ] A failed search never blocks filling the form by hand
- [ ] The error classification is a pure function with tests

## Notes

The messages for 429 and a missing URL already exist in `lib/plantSearch.js`;
they are thrown and then swallowed by the surrounding `catch`.
