---
id: 050
title: Year bloom view cuts month names and draws dots instead of bands
status: done
priority: P3
type: bug
---

## Problem

In Floraison → "Sur l'année" (024), the month header wraps mid-word on an
iPhone 17 ("Ja/n", "Fé/v") and each bloom month is a separate pill, so a
May–July bloom reads as three dots rather than one period.

## Acceptance criteria

- [x] Month headers never wrap: single letters (J F M A M J J A S O N D) or a
      compact form that fits 12 columns on a 390-pt-wide screen
- [x] Consecutive bloom months render as one continuous band, a wrapping range
      as two bands
- [x] The current month stays highlighted and gap months stay marked

## Notes

The approved Herbier mock-up draws exactly this: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks, artboard
"Floraison" (one bar per plant, coloured by flower, wrap = two bars).
