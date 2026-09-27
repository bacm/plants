#!/usr/bin/env bash
#
# Two separate guards, because they carry different weight:
#
#   1. A credential literal committed to the repo, or a tracked .env. Always a
#      hard failure — there is no legitimate reason for either.
#   2. A secret-shaped value read from an EXPO_PUBLIC_* variable. Metro inlines
#      every EXPO_PUBLIC_* var into the shipped bundle, so such a value is
#      readable by anyone who installs the app. Allowlisted per file in
#      scripts/secret-exceptions.txt so existing debt stays visible without
#      keeping the gate permanently red.
#
# Only tracked files are scanned: .env is gitignored and dist/ is build output.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

FAILED=0
EXCEPTIONS="scripts/secret-exceptions.txt"

# --- Guard 1: credential literals in tracked files ------------------------------

# Patterns are deliberately narrow to avoid false positives on ordinary prose.
CREDENTIAL_PATTERNS='(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)'

while IFS= read -r file; do
  [ -f "$file" ] || continue
  if grep -aEn "$CREDENTIAL_PATTERNS" "$file" >/dev/null 2>&1; then
    echo "FAIL: credential literal found in tracked file: $file"
    grep -aEn "$CREDENTIAL_PATTERNS" "$file" | sed 's/^/       /' | cut -c1-120
    FAILED=1
  fi
done < <(git ls-files)

if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo "FAIL: .env is tracked by git. Remove it from the index and rotate every key it held."
  FAILED=1
fi

# --- Guard 2: secrets exposed through EXPO_PUBLIC_* ----------------------------

SECRET_ENV='EXPO_PUBLIC_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)'

while IFS= read -r file; do
  [ -f "$file" ] || continue
  grep -Eq "$SECRET_ENV" "$file" 2>/dev/null || continue

  if [ -f "$EXCEPTIONS" ] && grep -Fxq "$file" <(grep -vE '^\s*(#|$)' "$EXCEPTIONS"); then
    echo "known: $file reads a secret from EXPO_PUBLIC_* (allowlisted, see $EXCEPTIONS)"
    continue
  fi

  echo "FAIL: $file reads a secret from an EXPO_PUBLIC_* variable."
  grep -En "$SECRET_ENV" "$file" | sed 's/^/       /' | cut -c1-120
  echo "       Metro inlines EXPO_PUBLIC_* into the shipped bundle — this value is public."
  echo "       Move the call behind a server, or add the file to $EXCEPTIONS with a ticket."
  FAILED=1
done < <(git ls-files '*.js' '*.jsx' '*.ts' '*.tsx' '*.json')

# --- Keep the allowlist honest -------------------------------------------------

if [ -f "$EXCEPTIONS" ]; then
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    if [ ! -f "$entry" ]; then
      echo "FAIL: $EXCEPTIONS lists '$entry', which does not exist. Remove the stale entry."
      FAILED=1
    elif ! grep -Eq "$SECRET_ENV" "$entry" 2>/dev/null; then
      echo "FAIL: $EXCEPTIONS lists '$entry', which no longer reads a secret. Remove the entry."
      FAILED=1
    fi
  done < <(grep -vE '^\s*(#|$)' "$EXCEPTIONS")
fi

if [ $FAILED -ne 0 ]; then
  echo
  echo "Secret scan failed."
  exit 1
fi

echo "Secret scan passed."
