import XCTest

/// Visual check with the device in Dark Mode: Talli is light-only, so system
/// chrome (header buttons, tab bar, menus, sheets) must stay light too.
/// Signed in from an earlier journey; does not reinstall.
@MainActor
final class AppearanceTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testChromeStaysLightInDarkMode() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    XCTAssertTrue(app.buttons["Add Expense"].waitForExistence(timeout: 20))
    sleep(3)
    snap("V01-home-dark-mode")
    app.navigationBars.buttons.firstMatch.tap()
    sleep(1)
    snap("V02-add-menu-dark-mode")
    app.visibleButton("Add Expense").tap()
    sleep(2)
    snap("V03-new-expense-dark-mode")
  }
}
