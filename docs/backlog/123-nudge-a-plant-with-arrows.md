---
id: 123
title: Nudge a placed plant by a few centimetres with arrow buttons
status: open
priority: P2
type: feature
---

## Problem

A plant on the plan can only be moved by a long-press drag
(`components/plan/PlanCanvas.js`, `dragGesture`). A finger cannot place it to
the centimetre, and with the magnet on a drag always lands on the 50 cm grid.

## Why it matters

Owner request (2026-10-01): "pouvoir déplacer les plantes de quelques cm vers
chaque direction avec des flèches". Together with the distances of ticket 122
it lets the owner set a plant exactly "40 cm from the border".

## Acceptance criteria

- [ ] The plant bubble gets a third row "Déplacer" under "Taille sur le plan":
      four arrow buttons ← ↑ ↓ → and a step pill; each arrow has an
      accessibility label ("Déplacer de 5 cm vers la gauche"…)
- [ ] One press moves the plant by the step in that direction; the step pill
      cycles 1 → 5 → 10 cm, 5 cm by default, remembered on the device
      (setting `plan.nudgeStepCm`)
- [ ] Arrows ignore the magnet: a 5 cm nudge is never pulled back to the grid
- [ ] Arrows never move a plant out of the zone it stands in (owner choice): a
      press that would cross a side stops the plant on that side (or does
      nothing when it is already there) and the arrow is disabled; a plant in no
      zone is held inside the garden border the same way
- [ ] A press that would land on a garden element is refused like a drop
      (red banner, plant stays)
- [ ] The bubble stays open, follows the plant, and the distances of ticket 122
      update after each press
- [ ] Each press is saved and synced like a drop (same `onDrop` write path,
      zone unchanged); rapid presses are not lost
- [ ] Jest: the pure nudge function (step, stop at a concave side, garden
      border, element refusal) in a lib test; e2e: three 5 cm presses move the
      plant 15 cm and the distance labels change by 15 cm; the step pill is
      remembered after a reload; the arrow toward a side is disabled at it
- [ ] Mock-up: PlanBulle artboard shows the "Déplacer" row, validated by the
      owner before implementing
- [ ] `npm run verify` and the plan e2e suite pass
- [ ] Tried on the iPhone

## Notes

Decisions taken with the owner on 2026-10-01: arrows in the bubble (not around
the dot), adjustable step 1/5/10 cm, magnet ignored, blocked at the zone edge
(changing zone stays a drag). Holding an arrow to repeat is out of scope.
Depends on 122 for the distance read-out.
