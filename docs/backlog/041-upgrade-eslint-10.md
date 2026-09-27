---
id: 041
title: Upgrade ESLint to version 10
status: open
priority: P3
type: chore
---

## Problem

Dependabot proposed ESLint 9.39.5 → 10.11.0 (PR #8) and CI failed on it. Major
ESLint versions change rule defaults and plugin APIs, and `eslint-config-expo`
must support the new version.

## Why it matters

Staying on 9 is fine for now, but it will stop receiving fixes, and the custom
`no-restricted-syntax` rule guarding un-awaited `db.*Async()` calls (CLAUDE.md
rule 1) must keep working after the upgrade.

## Acceptance criteria

- [ ] `eslint` 10 and a compatible `eslint-config-expo` for SDK 55 (or the upgrade
      waits for the SDK upgrade — record which)
- [ ] `npm run lint` passes with no rule disabled to get there
- [ ] A deliberately un-awaited `db.getFirstAsync()` still fails lint
- [ ] The PostToolUse lint hook still works

## Notes

Dependabot ignores ESLint majors (`.github/dependabot.yml`), so this ticket is
the only place the upgrade is tracked.
