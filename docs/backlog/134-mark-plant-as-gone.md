---
id: 134
title: Mark a plant as gone instead of deleting it
status: open
priority: P2
type: feature
---

## Problem

A plant that died or was dug up can only be deleted, which erases its photos,
journal and bloom history.

## Why it matters

The history of a lost plant is what tells the gardener not to plant it there
again.

## Acceptance criteria

- [ ] A plant field `goneAt` ('YYYY-MM-DD' or null) declared in
      `lib/plantFields.js`, with a migration, synced
      (`server/sync_schema.json`) and in backups
- [ ] The plant sheet's actions offer "Marquer comme disparue" (asks for the
      date, today by default); a gone plant's sheet shows "Disparue le …"
      with "Restaurer"
- [ ] A gone plant is left out of the dashboard (tasks, blooming), the bloom
      tab, zone lists and counts, the plan, the photo pick lists, and its
      reminders are never due
- [ ] The library hides gone plants unless its "Disparues" filter is on
- [ ] The "is this plant active" rule is a pure, Jest-tested helper;
      `npm run verify`, server pytest and `npm run e2e:web` pass
