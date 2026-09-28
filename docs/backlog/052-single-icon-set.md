---
id: 052
title: Replace emoji icons with one consistent icon set
status: done
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

- [x] Before implementing, 2–3 screens are mocked up (screenshots) and approved
      by the owner
- [x] One icon family (`@expo/vector-icons`, installed with `npx expo install`)
      replaces every emoji used as an icon; zone emoji chosen by the user stay
- [x] Icons are mapped next to their enum in `lib/enums.js` (CLAUDE.md rule 4)
- [x] Every icon-only control has an accessibilityLabel (with 027)

## Notes

Part of the visual pass with 053. CLAUDE.md rule 8 mentions `@expo/vector-icons`
was once used undeclared: declare it properly this time.

Approved mock-up (2026-09-28): https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks — thin stroke icons, one weight
(1.75). Needed by the Herbier restyle, 063–071.

Done with MaterialCommunityIcons (Ionicons lacked tree, tulip and sprout
glyphs), rendered only through `components/Icon.js`. `lib/__tests__/icons.test.js`
checks every icon name against the glyph map and fails on any emoji outside
the user-chosen `ZONE_ICONS` in `lib/enums.js`. Text arrows ("← Retour") became
chevron icons too. The iOS flow `09-capture-screen.yaml` lost its check on the
"En fleur" state: the pill now exposes `accessibilityState.checked`, and the
next simulator run should assert on it.
