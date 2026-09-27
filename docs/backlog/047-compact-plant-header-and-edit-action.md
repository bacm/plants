---
id: 047
title: Compact plant header without a photo, and a clear edit action
status: open
priority: P3
type: feature
---

## Problem

Without a photo, the plant detail header (`app/plant/[id].js`) spends about 40%
of the screen on a camera emoji and "Appuyez pour ajouter une photo". The
top-right action that opens the edit form is a gear, the same icon that opens
Réglages from the dashboard.

## Why it matters

The name, zone and tabs — what the user came for — start below the fold, and the
gear sends mixed signals.

## Acceptance criteria

- [ ] Without a photo (user photo or stored image), the header is compact: name,
      latin name and zone on top, with a small "Ajouter une photo" action
- [ ] With a photo, the current hero stays
- [ ] The edit action reads "Modifier" (text or a pencil icon with that
      accessibility label); the gear is used only for Réglages
