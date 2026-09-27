---
id: 003
title: Half-migrated light theme renders white text on white cards
status: done
priority: P0
type: bug
---

## Problem

Uncommitted changes to `components/GlassCard.js` and `components/GradientHero.js`
make both read `useColorScheme()` and pick from `colors.light` or `colors.dark`.
Nothing else in the app moved with them:

- `app.json` pins `"userInterfaceStyle": "light"`, so `useColorScheme()` always
  returns `'light'`
- `app/_layout.js` still hardcodes `contentStyle: { backgroundColor: '#1C1917' }`
  and `<StatusBar style="light" />`
- every screen still hardcodes `colors.dark.*` for text and backgrounds

So a card's background becomes `colors.light.surface` (`#FFFFFF`) while the text
inside stays `colors.dark.text` (`#FAFAF9`).

## Why it matters

White on white. The whole technical-details section of the plant detail screen,
the dashboard cards and the library rows become unreadable. These changes are
currently uncommitted, so nothing is shipped — but they also cannot be committed
as they stand.

## Acceptance criteria

One of the two, not a middle state:

**Option A — finish the migration**
- [ ] A theme accessor (hook or context) is the single way a component gets colors
- [ ] No screen references `colors.dark.*` or `colors.light.*` directly
- [ ] `app.json` uses `"userInterfaceStyle": "automatic"`
- [ ] `app/_layout.js` derives `contentStyle` and `StatusBar` from the scheme
- [ ] Both schemes verified on the dashboard, library, bloom, zones and plant
      detail screens

**Option B — revert to dark-only**
- [x] `GlassCard` and `GradientHero` go back to `colors.dark.*`
- [x] `colors.light` is deleted from `lib/theme.js`, or a comment records that it
      is reserved for a future migration with this ticket's number

## Notes

Resolved with option B. The components were already back on `colors.dark.*`
when this was picked up; `colors.light` is deleted, `app.json` now declares
`dark` so native chrome matches, and `_layout.js` reads the background from the
theme instead of a raw hex.


Option B is the smaller, safer change and nothing currently asks for light mode.
Option A is a real piece of work touching every screen — if that is the goal, it
deserves its own ticket per screen rather than one sweeping diff.

Blocks committing the working tree, so it should be resolved before 002.
