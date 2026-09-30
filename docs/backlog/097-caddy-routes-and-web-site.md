---
id: 097
title: Size Caddy limits per route and serve the web app on its own subdomain
status: open
priority: P1
type: bug
---

## Problem

`deploy/Caddyfile` caps every request body at 8 KB (`request_body max_size
8KB`), sized for `/search`. Behind it, `/sync/push` (up to 1000 rows) and every
`PUT /photos/{id}` would be refused on the VPS. The tests call the API
directly, so they do not see it. There is also no site for the web app yet.

## Why it matters

Sync and photo upload (092, 093) cannot work in production until this is
fixed, and the web app (095) has nowhere to live.

## Acceptance criteria

- [ ] Body limits per route: 8 KB for `/search` and the account routes (098),
      5 MB for `/sync/push`, 16 MB for `PUT /photos/*`; anything else keeps a
      small limit
- [ ] A second site, `{$WEB_DOMAIN}`, serves the static web build
      (`expo export --platform web`) with automatic HTTPS, the same security
      headers and a Content-Security-Policy
- [ ] `ALLOWED_ORIGINS` is set to the web origin by the deploy
- [ ] The shared-Caddy variant (`docs/DEPLOY-SERVER.md` §8b) documents both
      sites
- [ ] `docs/DEPLOY-SERVER.md` says to add the DNS record for `WEB_DOMAIN`
      (an A record to the VPS, like the API's) and how to deploy the web build
- [ ] Checked with `caddy validate` and with a real push and photo upload
      through Caddy (curl commands noted in the PR)

## Notes

Owner decision (2026-09-30): the web app gets its own subdomain rather than
sharing the API's. Caddy stays the only public entry point (reverse proxy);
the API port is never published. Login and anti-abuse live in the API (098),
not in Caddy basic auth: Caddy's stock image has no rate limiting.
