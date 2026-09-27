---
id: 052
title: Replace emoji icons with one consistent icon set
status: open
priority: P3
type: refactor
---

## Problem

Tabs (🌸 🗺 📅 📚), the plant sheet (📷 🌡 🍃 🪨), the search button (🔍) and more
use emoji, next to line icons (gear, leaf, arrow). Emoji render differently per
platform and make the app look unfinished.

## Why it matters

Visual consistency is most of what makes an app feel trustworthy.

## Acceptance criteria

- [ ] Before implementing, 2–3 screens are mocked up (screenshots) and approved
      by the owner
- [ ] One icon family (`@expo/vector-icons`, installed with `npx expo install`)
      replaces every emoji used as an icon; zone emoji chosen by the user stay
- [ ] Icons are mapped next to their enum in `lib/enums.js` (CLAUDE.md rule 4)
- [ ] Every icon-only control has an accessibilityLabel (with 027)

## Notes

Part of the visual pass with 053. CLAUDE.md rule 8 mentions `@expo/vector-icons`
was once used undeclared: declare it properly this time.
