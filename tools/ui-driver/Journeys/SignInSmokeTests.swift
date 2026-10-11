import XCTest

/// Signs in to an existing local-stack account (no guest data) and checks the
/// signed-in home renders. Expects a fresh install.
@MainActor
final class SignInSmokeTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testSignedInHomeRenders() throws {
    XCTAssertFalse(LocalAccount.password.isEmpty, "Run through run.sh so the local test password is set")
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    // The keychain can keep a session across reinstalls.
    if app.buttons["Get Started"].waitForExistence(timeout: 15) {
      app.finishOnboardingAsGuest()
      app.tabBars.buttons["Account"].waitAndTap()
      app.buttons["Sign In"].waitAndTap()
      app.signIn(email: LocalAccount.ben)
    }
    sleep(8)
    snap("S01-signed-in-home")
    XCTAssertFalse(app.staticTexts["Talli ran into a problem"].exists, "Signed-in home crashed")
    for tab in ["Spending", "Shared", "Account", "Home"] {
      app.tabBars.buttons[tab].waitAndTap()
      sleep(3)
      snap("S-tab-\(tab)")
      XCTAssertFalse(app.staticTexts["Talli ran into a problem"].exists, "\(tab) crashed")
    }
    // Open every group, including the friend ledger.
    for name in ["Bali trip", "NYC weekend", "Carla"] {
      app.tabBars.buttons["Shared"].waitAndTap()
      app.element(containing: name).waitAndTap()
      sleep(4)
      snap("S-group-\(name)")
      XCTAssertFalse(app.staticTexts["Talli ran into a problem"].exists, "\(name) crashed")
      if app.navigationBars.buttons.firstMatch.exists { app.navigationBars.buttons.firstMatch.tap() }
    }
  }
}
