---
id: 001
title: The OpenAI API key ships inside the app bundle
status: done
priority: P0
type: security
---

## Problem

`lib/plantSearch.js:4` reads `process.env.EXPO_PUBLIC_OPENAI_API_KEY`. Metro inlines
every `EXPO_PUBLIC_*` variable into the bundle at build time, so the key is a
literal in the shipped JavaScript.

Verified on 2026-09-27 against a local `expo export`: the key from `.env` appears
verbatim in the web bundle and in both Hermes bytecode bundles (iOS and Android).

`.env` itself is correctly gitignored and has never been committed — the exposure
is the distributed binary, not the repository.

## Why it matters

Anyone who installs the app, or opens the web build in a browser, can extract the
key and spend against the account. There is no way to revoke it per-user and no
usage attribution.

## Acceptance criteria

- [x] No `EXPO_PUBLIC_*` variable carries a credential; the client calls a server
      it does not authenticate with its own secret, or the feature is removed
- [x] `lib/plantSearch.js` is removed from `scripts/secret-exceptions.txt` and
      `npm run secrets` still passes
- [x] `README.md` no longer instructs the user to put a key in `.env`

## Notes

Resolved with option 1: a FastAPI proxy in `server/`. It builds the prompt
itself, so it is not an open OpenAI relay, and rate-limits per IP. Revoking the
old key and deploying the server are outside the repo and moved to 019.

Two viable shapes:

1. **Small proxy** (Cloudflare Worker, Vercel function) holding the key
   server-side. The app calls the proxy. Keeps the feature, adds a deploy target.
2. **Drop the AI lookup.** `lib/plantSearch.js` currently also fabricates image
   URLs (see 013), so the feature's value is partly illusory today.

Decide before implementing — the choice changes 013 and possibly 012.
