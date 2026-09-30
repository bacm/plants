---
id: 096
title: Upload the phone's existing garden to the server the first time
status: open
priority: P2
type: feature
---

## Problem

The phone already holds the whole garden and its photos. The first sync sends
everything at once, which can take long and must not be interrupted halfway
without a way to resume.

## Why it matters

A half-sent garden would show on the web as missing plants or photos, and the
owner could believe data was lost.

## Acceptance criteria

- [ ] Before the first sync, Réglages offers to export a backup (the existing
      "Exporter mon jardin")
- [ ] The first sync shows its progress (rows, then photos: "124 / 480
      photos") and resumes where it stopped if the app is closed
- [ ] At the end, the row and photo counts on the server match the phone's,
      and the screen says so
- [ ] Checked on the iPhone with the real garden (`npm run deploy:iphone`)

## Notes

Depends on 094. Do it on Wi-Fi: the photos weigh several hundred MB.
