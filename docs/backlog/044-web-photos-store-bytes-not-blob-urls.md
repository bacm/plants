---
id: 044
title: Web photos stored a blob URL that dies on reload
status: done
priority: P1
type: bug
---

## Problem

On web, `expo-image-picker` returns a `blob:` URL. `addPhoto` in `lib/db.web.js`
stored that string (in localStorage before 043, in IndexedDB after), not the
image bytes. A `blob:` URL only lives as long as the page, so every web photo
broke on the next reload while its row and date stayed visible. 043 was closed
believing the bytes were stored; its e2e check only looked at the date text.

## Why it matters

On web, every photo added so far is lost after a reload.

## Acceptance criteria

- [x] `addPhoto` on web reads the image bytes and stores them as data in
      IndexedDB; a reference it cannot read is refused with a message
- [x] Photos already stored as `blob:` URLs are rescued when still alive and
      otherwise reported once as missing, never deleted
- [x] The e2e photo test asserts the image actually decodes after a reload, and
      fails without this fix (checked)

## Notes

Photos added on web before this fix, in an earlier page session, cannot be
recovered: their bytes were never stored. Found by 020, whose export has to read
photo bytes.
