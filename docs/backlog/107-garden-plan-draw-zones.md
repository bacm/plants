---
id: 107
title: Draw garden zones on the plan
status: open
priority: P2
type: feature
---

## Problem

The plan of 106 shows zones only if they have an outline, and nothing yet
lets the owner draw one.

## Why it matters

Outlines give zones their real shape and area, and let a plant's zone follow
where it is placed.

## Acceptance criteria

- [ ] "Tracer une zone": tapping each corner places it, each side shows its
      length in metres, "Retirer le dernier coin" undoes one, "Terminer la
      zone" closes the shape (at least 3 corners, not degenerate)
- [ ] "Rectangle par cotes": width × length in metres gives a rectangle placed
      on the plan, then dragged into place
- [ ] Before saving, "Pour quelle zone ?" offers the zones without an outline
      and "+ Nouvelle zone" (which creates it)
- [ ] Editing a zone shows a handle on every corner to drag, its area, "Effacer
      le tracé" and "Terminer"
- [ ] Plants inside a new or changed outline are not moved; their zone is not
      changed silently (only moving a plant changes its zone, 106)
- [ ] Synced phone ⇄ web; matches the artboards PlanTracer, PlanRectangle and
      PlanModifierZone; `npm run verify` and `npm run e2e:web` pass

## Notes

Depends on 105 and 106. No grid snapping (owner decision).
