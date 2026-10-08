import XCTest

/// Update path, driven by check-upgrade.sh: phase 1 runs on the previous
/// build (sign in, browse so its query cache is saved); phase 2 runs after the
/// new build is installed over it without wiping data and must not land on
/// the error screen.
@MainActor
final class UpgradeJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testPhase1PreviousBuild() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.signInFromFreshInstall(email: LocalAccount.ben)
    for tab in ["Home", "Spending", "Shared", "Account", "Home"] {
      app.tabBars.buttons[tab].waitAndTap()
      sleep(3)
    }
    snap("U01-previous-build")
    sleep(4) // past the persister's 2 s write throttle
  }

  func testPhase2NewBuildOverIt() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Home"].waitForExistence(timeout: 20), "New build did not reach the app")
    for tab in ["Home", "Spending", "Shared", "Account"] {
      app.tabBars.buttons[tab].waitAndTap()
      sleep(2)
      XCTAssertFalse(app.staticTexts["Talli ran into a problem"].exists, "\(tab) crashed after the update")
    }
    snap("U02-new-build-over-previous")
  }
}
