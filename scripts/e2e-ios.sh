#!/usr/bin/env bash
# Runs the Maestro flows in e2e/ios/ against Expo Go on an iOS simulator:
# boots a simulator, starts Metro on a free port, runs the flows, and always
# tears Metro down again. Local dev only (needs Xcode, Maestro and a JDK) —
# not run in CI. See docs/backlog/055-maestro-ios-flows-in-repo.md.
set -euo pipefail

cd "$(dirname "$0")/.."

# --- Prerequisites ----------------------------------------------------

if ! command -v xcrun >/dev/null 2>&1; then
  echo "error: xcrun not found. Install Xcode and its command line tools:" >&2
  echo "  xcode-select --install" >&2
  exit 1
fi

if ! command -v maestro >/dev/null 2>&1; then
  echo "error: maestro not found. Install it with:" >&2
  echo '  curl -Ls "https://get.maestro.mobile.dev" | bash' >&2
  exit 1
fi

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "error: no JDK 17 found at \$JAVA_HOME ($JAVA_HOME). Install one with:" >&2
  echo "  brew install openjdk@17" >&2
  echo "or export JAVA_HOME to point at an existing JDK 17 before running this." >&2
  exit 1
fi

# --- Simulator ----------------------------------------------------------

find_udid() {
  # $1: node script body reading simctl's JSON from stdin and printing one udid.
  xcrun simctl list devices available -j | node -e "$1"
}

has_expo_go() {
  xcrun simctl listapps "$1" 2>/dev/null | grep -q "host.exp.Exponent"
}

pick_udid() {
  # $1: node script body producing one candidate udid per line (any order).
  # Same-named simulators can exist under several iOS runtimes (e.g. two
  # "iPhone 17", one per Xcode version) — only some may have Expo Go
  # installed, so that's the primary filter; booted-ness is just a
  # tiebreaker to avoid booting a second simulator unnecessarily.
  local candidates with_expo picked
  candidates=$(find_udid "$1")
  [ -z "$candidates" ] && return 1
  with_expo=""
  for udid in $candidates; do
    if has_expo_go "$udid"; then
      with_expo="$with_expo $udid"
    fi
  done
  [ -n "$with_expo" ] && candidates="$with_expo"
  picked=""
  for udid in $candidates; do
    state=$(xcrun simctl list devices -j | node -e "
      const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
      for (const runtime of Object.values(data.devices)) {
        const m = runtime.find((d) => d.udid === '$udid');
        if (m) { console.log(m.state); process.exit(0); }
      }
    ")
    if [ "$state" = "Booted" ]; then
      picked="$udid"
      break
    fi
    [ -z "$picked" ] && picked="$udid"
  done
  echo "$picked"
}

SIM_UDID=$(pick_udid "
  const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  for (const runtime of Object.values(data.devices)) {
    for (const d of runtime) {
      if (d.name === 'iPhone 17' && d.isAvailable) console.log(d.udid);
    }
  }
")

if [ -z "$SIM_UDID" ]; then
  echo "warning: no 'iPhone 17' simulator found, falling back to any available iPhone." >&2
  SIM_UDID=$(pick_udid "
    const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    for (const runtime of Object.values(data.devices)) {
      for (const d of runtime) {
        if (d.name.startsWith('iPhone') && d.isAvailable) console.log(d.udid);
      }
    }
  ")
fi

if [ -z "$SIM_UDID" ]; then
  echo "error: no available iPhone simulator found. Create one via Xcode > Settings > Platforms," >&2
  echo "or Xcode > Window > Devices and Simulators." >&2
  exit 1
fi

if ! has_expo_go "$SIM_UDID"; then
  echo "error: Expo Go isn't installed on simulator $SIM_UDID." >&2
  echo "Boot it (open -a Simulator), then install Expo Go by running:" >&2
  echo "  npx expo start --ios" >&2
  echo "once from this project (or open the App Store app in the simulator and install Expo Go manually), then re-run this." >&2
  exit 1
fi

SIM_STATE=$(find_udid "
  const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  for (const runtime of Object.values(data.devices)) {
    const match = runtime.find((d) => d.udid === '$SIM_UDID');
    if (match) { console.log(match.state); process.exit(0); }
  }
")

if [ "$SIM_STATE" != "Booted" ]; then
  echo "Booting simulator $SIM_UDID..."
  xcrun simctl boot "$SIM_UDID"
fi
open -a Simulator --args -CurrentDeviceUDID "$SIM_UDID" >/dev/null 2>&1 || true

# --- Free port ------------------------------------------------------------

PORT=8090
while lsof -i ":$PORT" >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

# --- Metro ------------------------------------------------------------

OUT_DIR=".maestro-output"
mkdir -p "$OUT_DIR"
METRO_LOG="$OUT_DIR/metro.log"

METRO_PID=""
cleanup() {
  if [ -n "$METRO_PID" ] && kill -0 "$METRO_PID" 2>/dev/null; then
    kill "$METRO_PID" 2>/dev/null || true
    wait "$METRO_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "Starting Metro on port $PORT..."
CI=1 npx expo start --port "$PORT" >"$METRO_LOG" 2>&1 &
METRO_PID=$!

READY=0
for _ in $(seq 1 60); do
  if curl -s "http://127.0.0.1:$PORT/status" 2>/dev/null | grep -q "packager-status:running"; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "error: Metro did not become ready on port $PORT within 60s. See $METRO_LOG" >&2
  exit 1
fi

# --- Maestro ------------------------------------------------------------

APP_URL="exp://127.0.0.1:$PORT"

# Full French month name for "today", matching lib/months.js's MONTH_NAMES
# array (index 0 = janvier). _seed-lavande.yaml (ticket 069: the pruning
# month is now picked by tapping a MonthRangePicker cell, whose
# accessibilityLabel is the full month name, not an abbreviation) needs this
# to select the current month in the pruning-month picker, so its seeded
# plant always matches whichever month this actually runs in instead of a
# hard-coded one.
MONTH_NAMES=(Janvier Février Mars Avril Mai Juin Juillet Août Septembre Octobre Novembre Décembre)
MONTH_INDEX=$((10#$(date +%m) - 1))
MONTH_NAME="${MONTH_NAMES[$MONTH_INDEX]}"

echo "Running Maestro flows against $APP_URL on device $SIM_UDID..."

# Optional arguments pick flows by number prefix instead of running the whole
# suite, e.g. `npm run e2e:ios -- 02 03` runs 02-*.yaml and 03-*.yaml. With
# no argument, the whole directory runs (config.yaml's `flows:` list).
TARGETS=(e2e/ios/)
if [ "$#" -gt 0 ]; then
  TARGETS=()
  for prefix in "$@"; do
    match=(e2e/ios/"$prefix"-*.yaml)
    if [ ! -f "${match[0]}" ]; then
      echo "error: no flow matches e2e/ios/$prefix-*.yaml" >&2
      exit 1
    fi
    TARGETS+=("${match[@]}")
  done
fi

set +e
maestro test "${TARGETS[@]}" \
  --udid "$SIM_UDID" \
  --env "APP_URL=$APP_URL" \
  --env "MONTH_NAME=$MONTH_NAME" \
  --test-output-dir "$OUT_DIR/run"
STATUS=$?
set -e

exit $STATUS
