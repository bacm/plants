---
id: 013
title: Plant image URLs are fabricated and mostly do not resolve
status: open
priority: P2
type: bug
---

## Problem

`getWikipediaImages` (`lib/plantSearch.js:32`) builds three URLs by string template
from the scientific name:

1. `https://en.wikipedia.org/wiki/<Name>` — an article URL, used as an image
   `src`. Never renders.
2. `https://commons.wikimedia.org/wiki/Special:FilePath/<Name>.jpg` — a guess that
   404s for most species, since Commons filenames rarely match the binomial.
3. A hardcoded generic "Flower_poster_2.jpg" thumbnail, identical for every plant.

Separately, the prompt at `lib/plantSearch.js:90` instructs the model to return
"3 URLs valides d'images (OBLIGATOIRE, ne pas laisser de tableau vide)". A language
model cannot verify a URL resolves, so it invents plausible ones.

## Why it matters

Every path produces either a broken image or a stock photo of unrelated flowers
presented as the plant the user just added. A wrong picture is worse than no
picture: it looks like data.

## Acceptance criteria

- [ ] No image URL is constructed by string template or produced by the model
- [ ] Images come from an API that returns URLs it actually holds, or the feature
      shows no image at all
- [ ] The `image_urls` instruction is removed from the prompt
- [ ] A missing image renders the existing placeholder rather than a broken
      `<Image>`

## Notes

Real options, all keyed on the scientific name:

- **Wikimedia Commons API** — `action=query&generator=search&gsrsearch=...&prop=imageinfo`
  returns real file URLs. Free, no key.
- **GBIF** — `api.gbif.org/v1/species/match` then occurrence media. Free, no key,
  botanically accurate.
- **Pl@ntNet** — best quality, needs an API key, which reopens 001.

Sequenced after 001, since that decides whether `lib/plantSearch.js` survives at
all. Blocks 012.
