---
id: 103
title: Always search with the strongest model at the highest effort
status: done
priority: P2
type: feature
---

## Problem

Plant search uses `gpt-4o-mini` (`server/app.py` `SEARCH_MODEL`). Only a "Pas la
bonne plante ? Recherche approfondie" button in `components/PlantForm.js` reruns
it with `gpt-5.5` at `reasoning_effort` "low". Owner decision (2026-09-30): every
search must use the strongest model at the highest effort, with no extra button.

## Why it matters

The first answer is often the wrong plant, and the user has to know to ask again.

## Acceptance criteria

- [x] The server always uses `PRECISE_SEARCH_MODEL` with `reasoning_effort` from env `SEARCH_REASONING_EFFORT` (allowed `low|medium|high`, default `high`, invalid value raises a `RuntimeError` at startup), whatever the request says. The installed iPhone app still sends `precise: false` or nothing: the field stays accepted and ignored, so the change reaches the phone with no app update.
- [x] The OpenAI call timeout stays under Cloudflare's 100 s proxy limit (85 s) and a timeout answers 504 with the French detail "La recherche a pris trop de temps, réessayez."
- [x] The app loses the "Recherche approfondie" button, the `precise` option of `searchPlants` and the related state and copy.
- [x] The loading text says the search may take up to a minute.
- [x] pytest and Jest are updated.
- [x] `npm run verify` passes

## Notes

Per-account and global daily budgets still cap cost. If real searches get close to
the timeout, set `SEARCH_REASONING_EFFORT=medium`.
