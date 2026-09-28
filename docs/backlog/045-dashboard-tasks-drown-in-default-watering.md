---
id: 045
title: Dashboard tasks drown in identical default watering reminders
status: done
priority: P2
type: bug
---

## Problem

`app/plant/new.js` gives every new plant a weekly watering reminder. With a few
plants, "Tâches du jour" becomes a stack of tall identical cards ("Arroser X ·
Fréquence : tous les 7 jours"), sometimes the same plant twice, pushing "Ce
mois-ci au jardin" below the fold. Cards show the frequency, not when the task
was due, and overdue tasks look exactly like today's. Seen in the UX review
(iOS simulator and web, 2026-09-27).

## Why it matters

The dashboard is the screen opened every day; noise there hides the tasks that
matter, and a blanket weekly watering is wrong for most outdoor plants.

## Acceptance criteria

- [x] Creating a plant no longer creates a reminder silently; watering is offered
      as a suggestion (like 022) the user can accept
- [x] Existing reminders are left untouched
- [x] Tasks of the same kind due the same day are grouped ("Arroser 4 plantes"),
      expandable, with a "tout marquer fait"
- [x] Each task shows its due date; overdue ones say by how much ("en retard de
      3 jours") and are visually distinct
- [x] "Ce mois-ci au jardin" is visible without scrolling on an iPhone 17 —
      checked with no due task (simulator, 2026-09-28); the 4-group case moves to 040
- [x] Grouping and lateness are pure functions with tests

## Notes

Rain-aware watering (028) will later postpone these reminders; keep the
grouping independent of it.
