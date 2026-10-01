---
id: 108
title: Give each plant its own size on the garden plan
status: in-progress
priority: P2
type: feature
---

## Problem

The plan (106) draws each plant at the sheet's `width`, which is the plant's
expected adult width (often filled in by plant search). A bonsai of 30 cm
whose species grows 4 m wide covers half a bed on the plan.

## Why it matters

The plan is meant to show what the garden looks like now; oversized dots hide
their neighbours and make the plan misleading.

## Acceptance criteria

- [x] Plants gain `planSizeCm` (integer cm, null = not set), kept out of the
      plant form like `planX`/`planY`, synced, in backups (optional column for
      older backups) and in `server/sync_schema.json`
- [x] A dot's size on the plan comes from `planSizeCm`; without it, a fixed
      size; the adult `width` is no longer used for the dot
- [x] The plant's bubble on the plan has a "Taille sur le plan" row: "−" and
      "+" change it in sensible steps, and tapping the value lets the owner
      type it in metres; changes are saved and synced
- [ ] Matches the updated PlanBulle artboard; `npm run verify`, server pytest
      and `npm run e2e:web` pass; the server deploy accepts the new column

## Notes

Owner decision (2026-10-01): a size specific to the plan, set from the
bubble; the adult width stays information on the sheet only, with no dashed
adult-size outline.
