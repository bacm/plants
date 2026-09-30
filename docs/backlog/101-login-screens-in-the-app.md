---
id: 101
title: Sign up and log in from the app, on the phone and the web
status: open
priority: P2
type: feature
---

## Problem

The app has only a token field in Réglages (`app/settings.js`). With accounts
(098), a user must be able to ask for an account, log in and log out.

## Why it matters

Without these screens, no one can use the web app or sync their phone.

## Acceptance criteria

- [ ] A "Compte" section in Réglages: "Créer un compte" (email, password,
      confirmation) and "Se connecter"; after signup it says the request
      awaits approval
- [ ] On the web, the whole app shows the login screen until logged in; the
      session is the cookie, nothing is stored in localStorage
- [ ] On the phone, login stores the device token in SecureStore; the app
      keeps working offline without an account (sync is simply off)
- [ ] "Se déconnecter" revokes the session or token on the server and forgets
      it locally; the phone's local garden is kept
- [ ] Clear messages for pending, refused, locked-out and wrong credentials,
      without revealing whether an email exists
- [ ] The old token field is removed, and the server stops accepting
      `API_TOKENS` on `/search` (kept by 098 for the installed app); `npm run verify` and `npm run e2e:web`
      pass

## Notes

Depends on 098. Mock-up screens to add to the Herbier canvas first.
