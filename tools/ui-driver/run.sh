#!/usr/bin/env bash
# Runs the XCUITest journeys against the Talli build installed on a simulator.
#   tools/ui-driver/run.sh <simulator-udid> [path/to/Talli.app] [-only-testing:TalliJourneys/Class/test]
# A given .app is reinstalled first (fresh data). Screenshots land in tools/ui-driver/out/.
set -euo pipefail
APP_ARG="${2:-}"; [ -n "$APP_ARG" ] && APP_ARG="$(cd "$(dirname "$APP_ARG")" && pwd)/$(basename "$APP_ARG")"
cd "$(dirname "$0")"
UDID="$1"; APP="$APP_ARG"; shift || true; [ -n "$APP" ] && shift || true
if [ -n "$APP" ]; then
  xcrun simctl uninstall "$UDID" com.manoloenriquez.talli >/dev/null 2>&1 || true
  xcrun simctl install "$UDID" "$APP"
fi
xcodegen generate --quiet
mkdir -p out
TEST_RUNNER_SCREENSHOT_DIR="$PWD/out" xcodebuild test \
  -project TalliUIDriver.xcodeproj -scheme TalliJourneys \
  -destination "platform=iOS Simulator,id=$UDID" \
  -derivedDataPath .build "$@" 2>&1 | grep -E "Test Case|error:|failed|passed|XCTAssert|TEST (SUCCEEDED|FAILED)"
