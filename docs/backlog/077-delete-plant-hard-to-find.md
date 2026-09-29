---
id: 077
title: "Supprimer la plante" is hard to find
status: done
priority: P1
type: bug
---

## Problem

The only way to delete a plant is a text link at the very bottom of the
detail screen's Actions tab, below the whole care history. The owner could not
find it, on the iPhone or the simulator. Deleting a plant also leaves its
bloom observations and its photo files behind.

## Why it matters

A plant added by mistake cannot be removed, as far as the user can tell.

## Acceptance criteria

- [x] The edit screen ("Modifier") ends with a clearly destructive
      "Supprimer la plante" button, with the same confirmation
- [x] Deleting from either place leaves no screen of the deleted plant in the
      back stack and lands on the dashboard
- [x] A failed delete shows `Alert.alert('Erreur', …)` and keeps the user on the
      screen (CLAUDE.md rule 6) — this closes 072 for the plant; 072's care-log
      half is fixed in the same change
- [x] `deletePlant` also removes the plant's bloom observations and its photo
      files (native and web)
- [x] `npm run verify` and `npm run e2e:web` pass, with an e2e check deleting a
      plant from the edit screen

## Notes

Reported by the owner on 2026-09-29.
