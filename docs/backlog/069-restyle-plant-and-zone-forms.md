---
id: 069
title: Restyle the plant and zone forms with the shared form components
status: open
priority: P3
type: feature
---

## Problem

`app/plant/new.js`, `app/plant/edit.js`, `app/zone/new.js`,
`app/zone/edit.js` and `components/ZoneForm.js` use the old form style.

## Why it matters

Adding a plant is the longest task in the app; it is where an inconsistent
style shows the most.

## Acceptance criteria

- [ ] Plant forms use the 065 components only: name with the search button
      and its suggestion list, latin name, zone chips, type chips, Exposition
      and Arrosage tiles, then "Plus de détails" expanding into section cards
      (Floraison, Dimensions, Sol, Entretien, Multiplication, Santé, Récolte,
      Autres)
- [ ] Bloom and harvest months use `MonthRangePicker`
- [ ] "Enregistrer" is a sticky bottom button; save errors still show
      `Alert.alert('Erreur', …)` and keep the user on the form (CLAUDE.md
      rule 6)
- [ ] Zone form: icon grid (052 icons, emoji still stored), name,
      description, a live preview card, "Créer la zone" / "Enregistrer"
- [ ] No field name is listed in a screen (CLAUDE.md rule 3)
- [ ] `npm run verify` and `npm run e2e:web` pass

## Notes

Mock-up: https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks, artboards
"Nouvelle plante", "Nouvelle plante · Plus de détails", "Nouvelle zone".
Depends on 063, 065.

new.js and edit.js share most of their form; if one form component serves
both, that is in scope.
