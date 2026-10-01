---
id: 101
title: Sign up and log in from the app, on the phone and the web
status: done
priority: P2
type: feature
---

## Problem

The app has only a token field in Réglages (`app/settings.js`). With accounts
(098), a user must be able to ask for an account, log in and log out.

## Why it matters

Without these screens, no one can use the web app or sync their phone.

## Acceptance criteria

- [x] A "Compte" section in Réglages: "Créer un compte" (email, password,
      confirmation) and "Se connecter"; after signup it says the request
      awaits approval
- [x] On the web, the whole app shows the login screen until logged in; the
      session is the cookie, nothing is stored in localStorage
- [x] On the phone, login stores the device token in SecureStore; the app
      keeps working offline without an account (sync is simply off)
- [x] "Se déconnecter" revokes the session or token on the server and forgets
      it locally; the phone's local garden is kept
- [x] Clear messages for pending, refused, locked-out and wrong credentials,
      without revealing whether an email exists
- [x] The old token field is removed from Réglages (the app no longer offers
      it); removing `API_TOKENS` server-side is ticket 104, after the owner's
      iPhone runs this version. `npm run verify` and `npm run e2e:web` pass

## Notes

Depends on 098. Mock-up screens to add to the Herbier canvas first.
