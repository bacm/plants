---
id: 027
title: Make every screen usable with a screen reader
status: open
priority: P3
type: feature
---

## Problem

No component in `app/` or `components/` sets `accessibilityLabel`,
`accessibilityRole` or `accessibilityHint`. Several controls are icon-only or
emoji-only.

## Why it matters

With VoiceOver or TalkBack the icon buttons are announced as "button" or not at
all, so the app cannot be used without sight.

## Acceptance criteria

- [ ] Every touchable has a French `accessibilityLabel` and the right
      `accessibilityRole`
- [ ] Decorative emoji and images are hidden from the accessibility tree
- [ ] The segmented controls announce their selected state
- [ ] Each screen is walked through once with VoiceOver or TalkBack, and the
      result noted here

## Notes

Easiest done screen by screen, one commit each.

Best done during the visual pass (052, 053), on the final screens.
