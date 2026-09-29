#!/usr/bin/env bash
# Deploys one commit of the search server on the VPS (ticket 079).
#
# Run by GitHub Actions over SSH as the forced command of its deploy key
# (see docs/DEPLOY-SERVER.md), so it is the only thing that key can do:
#   - the commit to deploy arrives as the SSH "command", in
#     $SSH_ORIGINAL_COMMAND, and must be a full 40-character SHA;
#   - the environment file arrives on stdin, one KEY=value per line, and only
#     the keys listed in ALLOWED_KEYS are accepted.
# Secrets therefore never appear in a command line, `ps` or a log.
set -euo pipefail
umask 077

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_DIR/deploy/.env"
COMPOSE=(docker compose -f "$REPO_DIR/deploy/docker-compose.yml")
ALLOWED_KEYS='API_DOMAIN|OPENAI_API_KEY|API_TOKENS|SEARCH_DAILY_BUDGET|ALLOWED_ORIGINS'
REQUIRED_KEYS=(API_DOMAIN OPENAI_API_KEY API_TOKENS)

fail() {
  echo "deploy: $*" >&2
  exit 1
}

# --- The commit to deploy ---------------------------------------------------

SHA="${SSH_ORIGINAL_COMMAND:-${1:-}}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || fail "expected a full commit SHA, got '${SHA}'"

# --- The environment file, from stdin ---------------------------------------

[ -t 0 ] && fail "expected the environment file on stdin"

TMP_ENV="$(mktemp "$REPO_DIR/deploy/.env.tmp.XXXXXX")"
trap 'rm -f "$TMP_ENV"' EXIT

while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && continue
  [[ "$line" =~ ^($ALLOWED_KEYS)=[^[:cntrl:]]*$ ]] || fail "rejected an environment line (key not allowed or bad characters)"
  printf '%s\n' "$line" >>"$TMP_ENV"
done

for key in "${REQUIRED_KEYS[@]}"; do
  grep -Eq "^$key=.+" "$TMP_ENV" || fail "$key is missing or empty"
done

# --- Check out the commit ---------------------------------------------------

cd "$REPO_DIR"
git fetch --quiet origin
git cat-file -e "$SHA^{commit}" 2>/dev/null || fail "commit $SHA not found on origin"
git checkout --quiet --detach "$SHA"
echo "deploy: checked out $SHA"

# Only now that the code is in place: an invalid env file never replaced a
# working one, and the rename is atomic.
mv "$TMP_ENV" "$ENV_FILE"
chmod 600 "$ENV_FILE"
trap - EXIT

# --- Start and wait for the API to be healthy -------------------------------

"${COMPOSE[@]}" up -d --build --remove-orphans

for _ in $(seq 1 45); do
  status="$("${COMPOSE[@]}" ps --format '{{.Health}}' api 2>/dev/null || true)"
  if [ "$status" = "healthy" ]; then
    echo "deploy: api is healthy"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 2
done

"${COMPOSE[@]}" logs --tail 50 api >&2 || true
fail "api did not become healthy"
