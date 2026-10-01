#!/usr/bin/env bash
# Runs the XCUITest journeys against the Talli build installed on a simulator.
#   tools/ui-driver/run.sh <simulator-udid> <path/to/Talli.app> [JourneyClass ...]
# Each journey gets a fresh install (journeys assume a first launch).
# Screenshots land in tools/ui-driver/out/.
set -euo pipefail
UDID="$1"
APP="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
shift 2
cd "$(dirname "$0")"
CLASSES=("$@")
[ ${#CLASSES[@]} -eq 0 ] && CLASSES=(GuestJourneyTests CurrencyJourneyTests)
xcodegen generate --quiet
mkdir -p out
status=0
for cls in "${CLASSES[@]}"; do
  xcrun simctl uninstall "$UDID" com.manoloenriquez.talli >/dev/null 2>&1 || true
  xcrun simctl install "$UDID" "$APP"
  TEST_RUNNER_SCREENSHOT_DIR="$PWD/out" xcodebuild test \
    -project TalliUIDriver.xcodeproj -scheme TalliJourneys \
    -destination "platform=iOS Simulator,id=$UDID" \
    -derivedDataPath .build "-only-testing:TalliJourneys/$cls" 2>&1 \
    | grep -E "Test Case|error:|TEST (SUCCEEDED|FAILED)" || true
  [ "${PIPESTATUS[0]}" -eq 0 ] || status=1
done
exit $status
