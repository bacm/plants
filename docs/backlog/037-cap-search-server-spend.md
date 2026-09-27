---
id: 037
title: Cap the search server's total OpenAI spend
status: done
priority: P1
type: security
---

## Problem

`server/app.py` rate-limits per client IP (20 requests per 60 s, in memory) and
has no client authentication — by design, since the app cannot hold a secret.
Nothing bounds the total: many IPs, or one attacker rotating IPs, can spend
without limit against the OpenAI account.

## Why it matters

The server's URL ships in every build. Once deployed (019), a single abuser can
run up the OpenAI bill, and nothing alerts anyone.

## Acceptance criteria

- [x] A global budget per day (requests, or estimated tokens) is enforced across
      all clients; beyond it `/search` answers 503 with a clear message ~~and the
      app shows it~~ (showing it moves to 038)
- [x] The budget is set by an environment variable with a safe default
- [x] Hitting the budget is logged at warning level once per day
- [ ] ~~A hard monthly spend limit is set in the OpenAI dashboard~~ — owner
      action, moved to 019
- [x] Tests cover the budget boundary and the daily reset with an injected clock

## Notes

In-memory is fine for one process, as for the rate limiter; note in
`server/README.md` that several instances would each get the full budget. App
attestation (App Attest / Play Integrity) is the real fix for "only my app may
call this" and is out of scope here.

`SEARCH_DAILY_BUDGET` (default 500) counts calls that reach OpenAI per UTC day;
validation errors and per-IP 429s do not consume it.
