import XCTest

/// "Try Again" on the root error screen must recover from bad saved server
/// data. Run plant-bad-cache.sh after a signed-in launch first; does not
/// reinstall.
@MainActor
final class RecoveryTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testTryAgainRecoversFromBadSavedData() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    XCTAssertTrue(app.staticTexts["Talli ran into a problem"].waitForExistence(timeout: 15))
    snap("R01-error-screen")
    app.buttons["Try Again"].firstMatch.waitAndTap()
    XCTAssertTrue(app.element(containing: "Your balance with others").waitForExistence(timeout: 15))
    sleep(5)
    XCTAssertFalse(app.staticTexts["Talli ran into a problem"].exists)
    snap("R02-recovered")
  }
}
