---
id: 028
title: Postpone outdoor watering reminders after enough rain
status: open
priority: P2
type: feature
---

## Problem

Watering reminders (`reminders`, kind `water`) advance on a fixed
`frequencyDays` whatever the weather. Nothing in the app knows it rained.

## Why it matters

"The app told me to water in the rain" is the standard complaint about plant apps
used outdoors. Houseplant-first competitors cannot solve it; an outdoor garden
app can.

## Acceptance criteria

- [ ] Each plant can be marked as sheltered (pot under cover, greenhouse) and is
      then never postponed
- [ ] When recorded rainfall since the last watering reaches a threshold, the
      due watering reminder moves forward by its frequency, and the dashboard
      says why ("12 mm de pluie hier — arrosage reporté")
- [ ] The user can still water manually; a postponed reminder is never silently
      deleted
- [ ] The threshold has a sensible default and is adjustable in settings
- [ ] Without location or network, reminders behave exactly as today
- [ ] The postpone decision is a pure function with tests

## Notes

Shares the location setting and the Open-Meteo call with 025 (frost alerts); do
whichever lands first as the shared weather module, not two clients. Open-Meteo
needs no key; a keyed provider would go through `server/`. Sheltered is a new
plant field: add it to `lib/plantFields.js` plus a migration.
