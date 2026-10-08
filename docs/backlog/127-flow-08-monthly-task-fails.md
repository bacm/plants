---
id: 127
title: Flow 08 never finds the pruning task for the seeded Lavande
status: open
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

- [ ] Root cause found: the seed, or the app
- [ ] `npm run e2e:ios -- 08` passes
- [ ] `npm run verify` passes
