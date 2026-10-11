#!/usr/bin/env bash
# Release check: does the new build open cleanly on top of the previous
# build's saved data? Catches persisted-cache shape changes made without a
# CACHE_BUSTER bump (TestFlight build 2 crashed on launch this way).
#
#   tools/ui-driver/check-upgrade.sh <udid> <new Talli.app> <previous main.jsbundle dir>
#
# The previous build's JS is bundled from its commit against the LOCAL stack:
#   git worktree add /tmp/prev <prev-commit> && (cd /tmp/prev && pnpm install)
#   cd /tmp/prev/apps/mobile && EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
#     EXPO_PUBLIC_SUPABASE_ANON_KEY=<local anon key> npx expo export:embed --platform ios \
#     --dev false --entry-file node_modules/expo-router/entry.js \
#     --bundle-output /tmp/prev/out/main.jsbundle --assets-dest /tmp/prev/out
# It runs inside the new native shell, so native changes between the two
# builds need a real previous .app instead.
set -euo pipefail
UDID="$1"; NEW="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"; PREV_JS="$(cd "$3" && pwd)"
cd "$(dirname "$0")"
source ./local-test-accounts.env
PREV_APP="$(mktemp -d)/Talli.app"
cp -R "$NEW" "$PREV_APP"
cp "$PREV_JS/main.jsbundle" "$PREV_APP/main.jsbundle"
[ -d "$PREV_JS/assets" ] && cp -R "$PREV_JS/assets/." "$PREV_APP/assets/"
codesign --force --deep --sign - "$PREV_APP" >/dev/null 2>&1
xcodegen generate --quiet
mkdir -p out
run() {
  TEST_RUNNER_SCREENSHOT_DIR="$PWD/out" TEST_RUNNER_LOCAL_TEST_PASSWORD="$LOCAL_TEST_PASSWORD" xcodebuild test \
    -project TalliUIDriver.xcodeproj -scheme TalliJourneys -destination "platform=iOS Simulator,id=$UDID" \
    -derivedDataPath .build "-only-testing:TalliJourneys/UpgradeJourneyTests/$1" > "out/upgrade-$1.log" 2>&1
}
xcrun simctl uninstall "$UDID" com.manoloenriquez.talli >/dev/null 2>&1 || true
xcrun simctl keychain "$UDID" reset >/dev/null 2>&1 || true
xcrun simctl install "$UDID" "$PREV_APP"
run testPhase1PreviousBuild || { echo "FAIL: could not use the previous build (out/upgrade-testPhase1PreviousBuild.log)"; exit 1; }
xcrun simctl install "$UDID" "$NEW"   # over it: data and keychain stay
run testPhase2NewBuildOverIt || { xcrun simctl io "$UDID" screenshot out/upgrade-failure.png >/dev/null 2>&1; echo "FAIL: new build broke on the previous build's data (out/upgrade-failure.png)"; exit 1; }
echo "PASS upgrade: new build opens cleanly over the previous build's saved data"
