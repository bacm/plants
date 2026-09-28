---
id: 063
title: Adopt the Herbier theme: light palette, Fraunces and Instrument Sans
status: done
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

- [x] `lib/theme.js` exports one palette, `colors`, with the Herbier tokens:
      paper `#F4F1EA`, surface `#FFFFFF`, border `#E4DFD3`, ink `#1F2A22`,
      muted `#5E6B61`, accent (moss) `#2F5D3A`, highlight (sprout) `#D5EDA8`,
      soft green `#EEF5E0`, blush `#E9D6D0`, terracotta `#B4532A`, danger
      `#A3402F`
- [x] No file references `colors.dark` any more
- [x] Fraunces (titles) and Instrument Sans (everything else) are installed
      with `npx expo install` (`@expo-google-fonts/fraunces`,
      `@expo-google-fonts/instrument-sans`, `expo-font`), loaded in
      `app/_layout.js` before the first screen renders, and exposed through
      `typography` in `lib/theme.js`
- [x] Radii follow the mock-up (cards 24–28, pills full, fields 18)
- [x] `app.json` declares `"userInterfaceStyle": "light"`; the status bar is
      dark on the paper background
- [x] Body and caption text reach 4.5:1 contrast on paper and surface
- [x] `npm run verify` passes; `npm run e2e:web` passes

## Notes

Mock-up: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks (all 16 artboards
use these tokens).

003 went dark-only on purpose; this ticket replaces that with light-only, not
with a light/dark switch. A dark variant would be a separate ticket.

`colorHex` (flower swatches) stays in `lib/theme.js`; its fallbacks move to the
new tokens.

Done. Token names stayed semantic so screens only lost `.dark`: paper =
`background`, ink = `text`, muted = `textSecondary`, moss = `accent`,
sprout = `highlight`, soft green = `softGreen`. `accentSoft` is now `#4A7556`
because screens put `#fff` on it. Font modules live in `lib/fonts.js`, which
keeps Jest away from native font loading. Screens that override `fontWeight`
after spreading `typography` still do: the screen tickets 066–071 clean that up.
The tab bar labels are clipped on a 390-pt-wide web view; 064 replaces that bar.
