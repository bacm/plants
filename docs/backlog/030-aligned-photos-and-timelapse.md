---
id: 030
title: Frame repeat photos with a ghost overlay and build a timelapse
status: open
priority: P2
type: feature
---

## Problem

Photos are taken with the system picker (`app/plant/[id].js`), so each one is
framed differently and the photo timeline cannot show growth meaningfully.

## Why it matters

A consistent before/after of a plant or a bed across seasons is the most visual,
most shareable thing a garden app can produce, and the photo history already
exists.

## Acceptance criteria

- [ ] An in-app camera shows the previous photo of the same plant as an adjustable
      semi-transparent overlay
- [ ] The photos tab offers a before/after comparison of any two photos
- [ ] A timelapse of a plant's photos can be played in the app and exported as a
      video or animated image through the share sheet
- [ ] Works for zones as well as plants
- [ ] Photos taken with the system picker still work as today
- [ ] New dependencies are declared in `package.json`

## Notes

`expo-camera` for the overlay. Video export is the costly part; an animated
image or an in-app slideshow is an acceptable first cut — split the ticket if so.
Zone photos need a `zoneId` on photos (migration).
