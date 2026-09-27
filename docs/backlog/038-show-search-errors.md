---
id: 038
title: Tell the user when plant search fails instead of showing no results
status: done
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

- [x] `searchPlants` distinguishes "no results" from "search failed" (throws, or
      returns a result object — decide in the plan)
- [x] Both screens show a short French message for failures, distinct for rate
      limit, daily budget reached (503, from 037), service unavailable, and no
      network
- [x] A failed search never blocks filling the form by hand
- [x] The error classification is a pure function with tests

## Notes

The messages for 429 and a missing URL already exist in `lib/plantSearch.js`;
they are thrown and then swallowed by the surrounding `catch`.

`searchPlants` returns `[]` only for a genuine empty result and throws
`PlantSearchError` (`kind`: config, rate_limited, daily_limit, unavailable,
offline) otherwise; both plant forms show its message under the search field.
