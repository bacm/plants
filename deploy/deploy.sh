#!/usr/bin/env bash
# Deploys one commit of the search server on the VPS (ticket 079).
#
# Run by GitHub Actions over SSH, via the forced command of its deploy key
# (deploy/authorized-key-line.sh), which has already checked out the commit
# being deployed:
#   - the commit to deploy arrives as the SSH "command", in
#     $SSH_ORIGINAL_COMMAND, and must be a full 40-character SHA;
#   - the environment file arrives on stdin, one KEY=value per line, and only
#     the keys listed in ALLOWED_KEYS are accepted.
# Secrets therefore never appear in a command line, `ps` or a log.
set -euo pipefail
umask 077

# The whole script is one function, called on the last line: bash reads a
# script as it runs it, and the `git checkout` below can replace this very
# file. Wrapped like this, bash has parsed everything before anything runs.
main() {
  REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
  ENV_FILE="$REPO_DIR/deploy/.env"
  COMPOSE=(docker compose -f "$REPO_DIR/deploy/docker-compose.yml")
  ALLOWED_KEYS='API_DOMAIN|WEB_DOMAIN|OPENAI_API_KEY|API_TOKENS|SEARCH_DAILY_BUDGET|SEARCH_DAILY_BUDGET_PER_ACCOUNT|PHOTO_QUOTA_BYTES|ALLOWED_ORIGINS|SHARED_CADDY_NETWORK'
  REQUIRED_KEYS=(API_DOMAIN WEB_DOMAIN OPENAI_API_KEY API_TOKENS)

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

  # WEB_DOMAIN ends up in a Caddyfile and in a CORS origin, so it must be a
  # plain hostname (no scheme, port, path or spaces).
  WEB_DOMAIN="$(sed -n 's/^WEB_DOMAIN=//p' "$TMP_ENV")"
  [[ "$WEB_DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]] ||
    fail "WEB_DOMAIN is not a hostname"

  # The API only answers browsers from ALLOWED_ORIGINS. Unless the owner set
  # it, the web app's own origin is the right default.
  if ! grep -Eq '^ALLOWED_ORIGINS=.+' "$TMP_ENV"; then
    # Drop an empty ALLOWED_ORIGINS= line first, so the file has one entry.
    sed -i.bak '/^ALLOWED_ORIGINS=$/d' "$TMP_ENV" && rm -f "$TMP_ENV.bak"
    printf 'ALLOWED_ORIGINS=https://%s\n' "$WEB_DOMAIN" >>"$TMP_ENV"
  fi

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

  # --- Standalone Caddy, or the VPS's own one -----------------------------------

  # SHARED_CADDY_NETWORK set: the VPS already runs a Caddy on 80/443, so this
  # stack's Caddy stays off and the API joins that Caddy's network instead
  # (deploy/docker-compose.shared-caddy.yml).
  SHARED_NETWORK="$(sed -n 's/^SHARED_CADDY_NETWORK=//p' "$ENV_FILE")"
  if [ -n "$SHARED_NETWORK" ]; then
    [[ "$SHARED_NETWORK" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "SHARED_CADDY_NETWORK is not a network name"
    docker network inspect "$SHARED_NETWORK" >/dev/null 2>&1 || fail "Docker network '$SHARED_NETWORK' does not exist"
    COMPOSE+=(-f "$REPO_DIR/deploy/docker-compose.shared-caddy.yml")
    echo "deploy: using the VPS's Caddy, network $SHARED_NETWORK"
  fi

  # --- Start and wait for the API and the web app to be healthy ---------------

  "${COMPOSE[@]}" up -d --build --remove-orphans

  # One 90 s budget shared by both services: each is polled in turn, and the
  # one that never gets healthy is named and its logs shown.
  for service in api web; do
    healthy=""
    for _ in $(seq 1 45); do
      status="$("${COMPOSE[@]}" ps --format '{{.Health}}' "$service" 2>/dev/null || true)"
      if [ "$status" = "healthy" ]; then
        healthy=1
        echo "deploy: $service is healthy"
        break
      fi
      sleep 2
    done
    if [ -z "$healthy" ]; then
      "${COMPOSE[@]}" logs --tail 50 "$service" >&2 || true
      fail "$service did not become healthy"
    fi
  done

  docker image prune -f >/dev/null
  exit 0
}

main "$@"
