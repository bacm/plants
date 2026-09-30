---
id: 089
title: Bring the mock-up up to date with tickets 086 to 088
status: open
priority: P2
type: chore
---

## Problem

Tickets 086 (zoomable full-screen photo on "À trier"), 087 (swipe between a
plant's photos) and 088 (choose the cover photo) shipped without their
artboards being updated in the Herbier mock-up
(https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks). That session had no
Artifact tool, and the Claude Docs tools cannot open a Claude Design canvas.

## Why it matters

The owner's rule: every UI change updates the mock-up too, so it stays the
reference for the next screens.

## Acceptance criteria

- [ ] Sort artboard ("Tri"): an expand badge (round, overlayDark, `arrow-expand`
      icon) top-left of the photo; new artboard "TriPleinEcran": the photo whole
      on black, "‹ Retour" top-left
- [ ] PhotoVisionneuse: the date line reads "12 mai 2026 · 2 / 5"; a
      "☆ Mettre en accueil" button top-right in the header, opposite "Retour"
- [ ] New artboard "PhotoAccueil" (or a PhotoVisionneuse variant): the same
      viewer with the photo already chosen — filled star in the highlight
      colour, label "Photo d'accueil"
- [ ] Plant detail Photos tab: one thumbnail carries the cover badge (round,
      overlayDark, small highlight `star`, top-left)
- [ ] Artboards compared against the app's web build at 390×844

## Notes

Needs a session with the Artifact tool (read `project/<Name>.dc.html`).
The code is the reference: `app/sort.js`, `app/plant/[id].js` (lightbox
header), `components/plant/PhotosTab.js` (`coverBadge`).
