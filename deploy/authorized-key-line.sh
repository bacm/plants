#!/usr/bin/env bash
# Prints the line to put in the VPS's /home/deploy/.ssh/authorized_keys for
# the GitHub Actions deploy key (ticket 079). Run on your Mac:
#
#   deploy/authorized-key-line.sh ~/.ssh/plants_gha_deploy.pub
#
# The line restricts the key to one forced command: a bootstrap that never
# changes and does not depend on the checkout. On each deploy it checks the
# requested commit is a full SHA, clones the repository if the VPS has none
# yet, checks that commit out and runs its deploy/deploy.sh. So the VPS never
# needs a manual `git pull`, even when deploy.sh itself changes.
#
# $sha is only used unquoted after the regex has proved it is 40 hex digits.
# The command holds no double quote, so it needs no escaping inside
# command="…".
set -euo pipefail

PUB_FILE="${1:?usage: $0 <public key file>}"
PUB="$(tr -d '\n' <"$PUB_FILE")"
REPO_URL="https://github.com/bacm/plants.git"

BOOTSTRAP="sha=\$SSH_ORIGINAL_COMMAND; \
[[ \$sha =~ ^[0-9a-f]{40}\$ ]] || { echo 'deploy: expected a full commit SHA' >&2; exit 1; }; \
[ -d ~/plants/.git ] || git clone -q $REPO_URL ~/plants || exit 1; \
cd ~/plants && git fetch -q origin && git checkout -q --detach \$sha && exec deploy/deploy.sh"

printf 'command="%s",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty %s\n' \
  "$BOOTSTRAP" "$PUB"
