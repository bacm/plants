---
id: 053
title: Denser cards, list thumbnails and lighter typography
status: open
priority: P3
type: feature
---

## Problem

Cards are very tall with large radii and vertical gaps: about 3.5 plants fit on
the Bibliothèque screen and 4 tasks on the dashboard (iPhone 17). Lists show a
colour dot instead of the plant's photo.

## Acceptance criteria

- [x] Before implementing, the dashboard, Bibliothèque and plant detail are
      mocked up and approved by the owner
- [ ] At least 6 plants fit on the Bibliothèque screen of an iPhone 17
- [ ] List rows show the plant's photo (user photo, else stored image, else
      placeholder) as a thumbnail
- [ ] Spacing, radii and type scale change only through `lib/theme.js`
- [ ] Screens are re-checked in the iOS simulator and on web

## Notes

Do together with 052 and 046's tile labels; 027 (accessibility) fits in the same
pass.

The dashboard part is superseded by 058; this ticket keeps lists and detail.

Approved mock-up (2026-09-28): https://claude.ai/artifact/1gkwXJGkWRBB2VFmiYx6Ks. Its Bibliothèque grid shows about 4
plants, not 6: settle that before 068.
Owner decision (2026-09-29): the redesign follows the mock-up first; the
6-plant criterion is revisited after 068.
