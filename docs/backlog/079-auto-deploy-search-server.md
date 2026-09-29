---
id: 079
title: Deploy the search server to the VPS from GitHub Actions
status: done
priority: P2
type: chore
---

## Problem

After 076, updating the server means logging into the VPS, pulling and
rebuilding by hand, and its secrets live only in a file on that machine.

## Why it matters

A manual step is easy to skip or get wrong, and a VPS that dies takes its
configuration with it.

## Acceptance criteria

- [x] A push to `main` touching `server/` or `deploy/` (or a manual run) runs
      the server tests, builds the image, then deploys that exact commit
- [x] The OpenAI key, `API_TOKENS` and the deployment settings live in the
      GitHub `production` environment; the VPS receives them over SSH stdin
      and writes `deploy/.env` with mode 600, never via a command argument
- [x] The SSH key GitHub uses can only run `deploy/deploy.sh` (forced
      command); the host key is pinned
- [x] Third-party actions are pinned by commit SHA; the deploy job has
      read-only repository permissions
- [x] The workflow fails if `/health` does not answer after the deploy
- [x] `docs/DEPLOY-SERVER.md` walks through every owner step with exact
      commands
- [x] `deploy/deploy.sh` is exercised locally against Docker

## Notes

Requested by the owner on 2026-09-29. Whether each deploy needs a manual
approval is a GitHub setting ("Required reviewers" on the environment), not
code.
