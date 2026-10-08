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
# Signed-in journeys use local-only test accounts (see local-test-accounts.env).
LOCAL_TEST_PASSWORD=""
[ -f local-test-accounts.env ] && source ./local-test-accounts.env
[ ${#CLASSES[@]} -eq 0 ] && CLASSES=(GuestJourneyTests CurrencyJourneyTests)
xcodegen generate --quiet
mkdir -p out
status=0
for cls in "${CLASSES[@]}"; do
  xcrun simctl uninstall "$UDID" com.manoloenriquez.talli >/dev/null 2>&1 || true
  xcrun simctl keychain "$UDID" reset >/dev/null 2>&1 || true  # sessions survive uninstall
  xcrun simctl install "$UDID" "$APP"
  rc=0
  TEST_RUNNER_SCREENSHOT_DIR="$PWD/out" TEST_RUNNER_LOCAL_TEST_PASSWORD="$LOCAL_TEST_PASSWORD" \
    TEST_RUNNER_FRIEND_TOKEN="${FRIEND_TOKEN:-}" TEST_RUNNER_NEW_ACCOUNT_EMAIL="${NEW_ACCOUNT_EMAIL:-}" TEST_RUNNER_SCREEN_PREFIX="${SCREEN_PREFIX:-tour}" xcodebuild test \
    -project TalliUIDriver.xcodeproj -scheme TalliJourneys \
    -destination "platform=iOS Simulator,id=$UDID" \
    -derivedDataPath .build "-only-testing:TalliJourneys/$cls" > "out/$cls.log" 2>&1 || rc=$?
  grep -E "Test Case|error:|TEST (SUCCEEDED|FAILED)" "out/$cls.log" || true
  if [ "$rc" -ne 0 ]; then
    status=1
    xcrun simctl io "$UDID" screenshot "out/$cls-failure.png" >/dev/null 2>&1 || true
  fi
done
exit $status
