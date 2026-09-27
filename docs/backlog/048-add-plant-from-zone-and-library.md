---
id: 048
title: Add a plant from any zone, and keep the add button reachable
status: open
priority: P2
type: feature
---

## Problem

The zone detail screen offers "+ Ajouter une plante" only while the zone is
empty. In Bibliothèque the add button sits after the whole list.

## Why it matters

Adding a plant to a bed is the most natural flow, and today it requires going
through Bibliothèque and picking the zone again; with a long library the add
button is a scroll away.

## Acceptance criteria

- [ ] A zone always offers "Ajouter une plante", which opens the form with that
      zone preselected
- [ ] Bibliothèque has an add action that stays visible whatever the scroll
      position (header action or floating button)
- [ ] The e2e test adds a second plant from a zone and finds it in that zone
