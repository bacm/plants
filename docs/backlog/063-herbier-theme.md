---
id: 063
title: Adopt the Herbier theme: light palette, Fraunces and Instrument Sans
status: open
priority: P2
type: feature
---

## Problem

`lib/theme.js` defines a dark brown palette (`colors.dark`) with system fonts;
20 files under `app/` and `components/` read `colors.dark.*` directly. The owner
approved a new light "Herbier" look (mock-up in Notes) that none of this matches.

## Why it matters

Every restyle ticket (064–071) builds on these tokens. Changing them first, in
one place, moves the whole app most of the way at once and keeps the later
screen tickets small.

## Acceptance criteria

- [ ] `lib/theme.js` exports one palette, `colors`, with the Herbier tokens:
      paper `#F4F1EA`, surface `#FFFFFF`, border `#E4DFD3`, ink `#1F2A22`,
      muted `#5E6B61`, accent (moss) `#2F5D3A`, highlight (sprout) `#D5EDA8`,
      soft green `#EEF5E0`, blush `#E9D6D0`, terracotta `#B4532A`, danger
      `#A3402F`
- [ ] No file references `colors.dark` any more
- [ ] Fraunces (titles) and Instrument Sans (everything else) are installed
      with `npx expo install` (`@expo-google-fonts/fraunces`,
      `@expo-google-fonts/instrument-sans`, `expo-font`), loaded in
      `app/_layout.js` before the first screen renders, and exposed through
      `typography` in `lib/theme.js`
- [ ] Radii follow the mock-up (cards 24–28, pills full, fields 18)
- [ ] `app.json` declares `"userInterfaceStyle": "light"`; the status bar is
      dark on the paper background
- [ ] Body and caption text reach 4.5:1 contrast on paper and surface
- [ ] `npm run verify` passes; `npm run e2e:web` passes

## Notes

Mock-up: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks (all 16 artboards
use these tokens).

003 went dark-only on purpose; this ticket replaces that with light-only, not
with a light/dark switch. A dark variant would be a separate ticket.

`colorHex` (flower swatches) stays in `lib/theme.js`; its fallbacks move to the
new tokens.
