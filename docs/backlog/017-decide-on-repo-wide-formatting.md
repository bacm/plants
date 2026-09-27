---
id: 017
title: Decide whether to enforce Prettier formatting repo-wide
status: open
priority: P3
type: chore
---

## Problem

Prettier is installed and configured (`.prettierrc`), and `npm run format` works,
but nothing enforces it: it is not in `npm run verify`, not in the pre-commit hook,
and not in CI.

That was deliberate. Gating on formatting requires reformatting every existing file
first, which is a large diff across the whole codebase that nobody asked for and
that would bury the history of every line in it.

## Why it matters

As it stands, formatting is advisory and will drift — files Claude writes will be
Prettier-clean while older files stay as they are, producing a codebase with two
styles and noisy diffs whenever an old file is touched.

The cost is real but small; the point of this ticket is that the decision is made
on purpose rather than by neglect.

## Acceptance criteria

One of the two:

**Option A — enforce it**

- [ ] `npm run format` is run once across the repo, as its own commit touching
      nothing but formatting
- [ ] That commit's SHA is added to `.git-blame-ignore-revs` so `git blame` skips it
- [ ] `format:check` is added to `npm run verify` and to CI
- [ ] The commit is not mixed with any behavioural change

**Option B — drop it**

- [ ] Prettier is removed from `devDependencies`
- [ ] `.prettierrc`, `.prettierignore` and the `format` script are deleted
- [ ] CLAUDE.md stops mentioning formatting

## Notes

Option A is the usual answer for a project where an agent writes most of the code,
because consistent formatting is what keeps diffs reviewable. The one-time
reformat is best done when the working tree is otherwise clean — so after 003 is
resolved, not before.
