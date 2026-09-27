---
id: 018
title: Split planning and implementation across models to cut token cost
status: done
priority: P3
type: chore
---

## Problem

Every step of a ticket — searching, editing, re-running lint, fixing — ran in the
main Opus session, so the most expensive model spent most of its tokens on
mechanical work.

## Why it matters

Token cost per ticket is dominated by file reads and edit loops that do not need
Opus-level judgement.

## Acceptance criteria

- [x] `.claude/agents/scout.md` (Haiku, read-only) and
      `.claude/agents/implementer.md` (Sonnet) exist
- [x] `.claude/settings.json` pins the main session to Opus
- [x] CLAUDE.md "Working a ticket" describes plan → implement → review and who
      does each step
- [x] `npm run verify` passes

## Notes

Agent model aliases (`opus`, `sonnet`, `haiku`) resolve to the latest version of
each family, so they do not need bumping when a new model ships.
