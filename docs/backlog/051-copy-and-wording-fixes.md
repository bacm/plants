---
id: 051
title: Fix copy and wording mistakes found in the UX review
status: open
priority: P3
type: bug
---

## Problem

- "Plus de details" lacks its accent (new/edit plant)
- The dashboard section reads "En fleurs ce mois" (should be "En fleur ce mois-ci")
- Zone deletion says "Les 1 plante de cette zone resteront…"
- Dashboard subtitle wraps awkwardly on narrow screens
- Section titles are all-caps bold ("FICHE TECHNIQUE", "SOL"), heavy to read

## Acceptance criteria

- [ ] "Plus de détails"; the zone deletion message handles 0, 1 and N plants
- [ ] A shared French plural helper is used for counts in user-facing text,
      with tests
- [ ] Section titles use sentence case at a lighter weight (via `lib/theme.js`)
