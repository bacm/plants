---
id: 026
title: Identify an unknown plant from a photo
status: open
priority: P3
type: feature
---

## Problem

Adding a plant requires knowing its name: the search in `app/plant/new.js` is by
text only.

## Why it matters

The plants a gardener most wants to add are often the ones they cannot name.

## Acceptance criteria

- [ ] From the new-plant screen, the user takes or picks a photo and gets up to
      five candidate species with a confidence score
- [ ] Choosing a candidate fills the form the same way a text-search suggestion
      does
- [ ] The identification API key lives only in `server/`; the app calls a new
      server endpoint
- [ ] The endpoint bounds image size and is rate-limited like `/search`
- [ ] Server tests cover the endpoint with the upstream mocked

## Notes

Pl@ntNet has a free tier for non-commercial use. Depends on 019 for the server
being deployed.
