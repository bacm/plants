---
id: 098
title: Add user accounts that the owner must approve before first login
status: open
priority: P1
type: security
---

## Problem

The server knows only a fixed list of device tokens (`API_TOKENS`). There are
no accounts, no login, and no way for someone to ask for access. The owner
wants each user to have their own garden, and wants to approve every account
by hand before it can be used.

## Why it matters

The web app will be public on the Internet. Without real accounts, anyone
holding a token reaches every garden, and there is no way to let a new person
in or to cut one off.

## Acceptance criteria

- [ ] `POST /auth/signup` (email, password) creates a **pending** account; a
      pending or refused account can never log in or reach any data
- [ ] Passwords are hashed with `hashlib.scrypt` and a per-account salt (no
      new dependency), minimum 12 characters; never logged or returned
- [ ] `POST /auth/login` returns, for an approved account, either an
      HttpOnly + Secure + SameSite=Strict session cookie (web) or a device
      token (phone, stored in SecureStore); `POST /auth/logout` revokes it
- [ ] Every data route (`/sync/*`, `/photos/*`, `/search`) resolves the
      account from the cookie or the device token; `API_TOKENS` is removed
- [ ] Anti-abuse: login limited per IP and per account (after 5 failures,
      growing lockout); signup limited per IP with a honeypot field and a cap
      on pending accounts; the same error whether or not the email exists;
      every rejected attempt logged without the password
- [ ] Cookie-authenticated requests that change data check the `Origin`
      header against `ALLOWED_ORIGINS` (CSRF)
- [ ] The first admin account is created with a command run on the server
      (`docker compose exec api python -m accounts create-admin`), not
      through signup
- [ ] pytest covers signup, pending login refused, approval, login, logout,
      lockout, honeypot, CSRF and a revoked token

## Notes

Owner decisions (2026-09-30): each user has their own garden; accounts need
the owner's approval (no CAPTCHA). No email is sent (no SMTP): a forgotten
password is reset by an admin (099). Account data lives in the same SQLite
database as the sync store.
