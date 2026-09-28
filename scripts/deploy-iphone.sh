#!/usr/bin/env bash
#
# Builds a Release version of the app and installs it on the iPhone connected to
# this Mac. See docs/DEPLOY-IPHONE.md before the first run.
#
# The installed app keeps its data across deploys (same bundle identifier), as
# long as it is not deleted from the phone first.
#
# Usage: npm run deploy:iphone            (asks for confirmation)
#        npm run deploy:iphone -- --yes   (no prompt)
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

ASSUME_YES=0
[ "${1:-}" = "--yes" ] && ASSUME_YES=1

fail() {
  echo "✖ $1" >&2
  exit 1
}

# --- Prerequisites -------------------------------------------------------------

command -v xcrun >/dev/null 2>&1 || fail "Xcode is required (xcode-select --install, then install Xcode)."

# An iPhone must be paired and reachable (USB or the same Wi-Fi network).
# "unavailable" contains "available": exclude it before matching.
if ! xcrun devicectl list devices 2>/dev/null | grep -E "iPhone" | grep -v "unavailable" | grep -qE "connected|available"; then
  echo "No reachable iPhone found. Devices known to Xcode:" >&2
  xcrun devicectl list devices 2>/dev/null | sed 's/^/  /' >&2 || true
  fail "Connect the iPhone by USB, unlock it and trust this Mac, then retry."
fi

# --- Plant search server URL ---------------------------------------------------

# Metro inlines EXPO_PUBLIC_* at build time, so the URL is frozen into this build.
API_URL="${EXPO_PUBLIC_PLANT_API_URL:-}"
if [ -z "$API_URL" ] && [ -f .env ]; then
  API_URL="$(grep -E '^EXPO_PUBLIC_PLANT_API_URL=' .env | tail -1 | cut -d= -f2- || true)"
fi
if [ -z "$API_URL" ]; then
  echo "⚠ EXPO_PUBLIC_PLANT_API_URL is empty: plant search will say it is not configured."
elif echo "$API_URL" | grep -qE 'localhost|127\.0\.0\.1'; then
  echo "⚠ EXPO_PUBLIC_PLANT_API_URL points at localhost: the phone cannot reach that."
  echo "  Use this Mac's LAN IP (ipconfig getifaddr en0) or the deployed server's URL."
fi

# --- Data safety ---------------------------------------------------------------

cat <<'EOF'

Before deploying:
  • Do NOT delete the app from the phone — that erases the garden.
  • Back up first: in the app, Réglages → Exporter mon jardin. If the installed
    version has no export yet, use Xcode → Window → Devices and Simulators →
    the iPhone → Plants → ⚙︎ → Download Container…

EOF
if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "Backup done, deploy now? [y/N] " answer
  case "$answer" in
    y | Y | o | O) ;;
    *) fail "Cancelled." ;;
  esac
fi

# --- Build and install ---------------------------------------------------------

echo "Generating the native iOS project..."
npx expo prebuild --platform ios --clean

echo "Building the Release app and installing it on the iPhone..."
npx expo run:ios --configuration Release --device

echo "✔ Installed. First thing on the phone: Réglages → Exporter mon jardin."
