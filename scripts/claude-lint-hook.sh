#!/usr/bin/env bash
#
# Claude Code PostToolUse hook: lints the file that was just edited and feeds any
# error back to Claude immediately, instead of letting it surface at commit time
# or in CI. This is the short feedback loop; scripts/hooks/pre-commit and
# .github/workflows/ci.yml are the longer ones.
#
# Wired up in .claude/settings.json. Receives the tool call as JSON on stdin.
# Exit 2 makes Claude read stderr and correct itself; any other outcome is silent.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Parse stdin with node rather than jq, which is not guaranteed to be installed.
FILE="$(node -e '
let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(raw);
    process.stdout.write(payload.tool_input?.file_path ?? "");
  } catch {
    process.stdout.write("");
  }
});
' 2>/dev/null)"

# Nothing to lint: not a JS file, or a path outside this repo.
[ -n "$FILE" ] || exit 0
[ -f "$FILE" ] || exit 0
case "$FILE" in
  *.js) ;;
  *) exit 0 ;;
esac
case "$FILE" in
  "$REPO"/*) ;;
  *) exit 0 ;;
esac

# Format first, so `format:check` in verify never fails on a file Claude wrote.
# Prettier reads .prettierignore itself; a formatting failure is left to verify.
(cd "$REPO" && npx --no-install prettier --write --log-level warn "$FILE" >/dev/null 2>&1)

OUTPUT="$(cd "$REPO" && npx --no-install eslint --format stylish "$FILE" 2>&1)"
STATUS=$?

if [ $STATUS -ne 0 ]; then
  {
    echo "ESLint failed on ${FILE#"$REPO"/}:"
    echo
    echo "$OUTPUT"
    echo
    echo "Fix these before moving on. Coding rules: CLAUDE.md"
  } >&2
  exit 2
fi

exit 0
