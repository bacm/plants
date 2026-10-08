---
id: 127
title: Flow 08 never finds the pruning task for the seeded Lavande
status: done
priority: P2
type: bug
---

## Problem

`e2e/ios/08-monthly-task.yaml` fails on `assertVisible: "Tailler · Lavande"`:
the dashboard's "Ce mois-ci au jardin" says "Rien à faire ce mois-ci" although
`_seed-lavande.yaml` sets the current month as the pruning month. It failed
before 062 too, when the seed tapped the bloom period's month by mistake and
the plant was never saved. Since 062 the plant is saved, so either the tap
under "Mois de taille" lands on another picker, the pruning range also needs
an end month, or the dashboard does not derive the task.

## Why it matters

The iOS suite cannot pass before a device deploy, and a real regression in the
monthly tasks would hide behind this known failure.

## Acceptance criteria

- [x] Root cause found: the seed, or the app
- [x] `npm run e2e:ios -- 08` passes
- [x] `npm run verify` passes

## Resolution

The seed, not the app. `scrollUntilVisible` stopped with "Mois de taille" and
its month row behind the sticky "Enregistrer" footer (Maestro counts an
element under it as visible), so the month tap missed and Lavande was saved
with no pruning month. Centring the picker (`centerElement: true`) puts the
row in view; flow 08 passed on the simulator on 2026-10-08.
