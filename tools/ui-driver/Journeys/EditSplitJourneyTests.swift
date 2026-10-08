import XCTest

/// Group expense edit on mobile: change the date and switch an equal split to
/// percentages (50/30/20). run-edit.sh seeds "Edit Trip" (Ana, Carla, Dina,
/// ₱900 Villa split equally) and checks the stored rows afterwards.
@MainActor
final class EditSplitJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  private func replace(_ field: XCUIElement, with text: String, in app: XCUIApplication) {
    field.waitAndTap()
    field.press(forDuration: 1.0)
    if app.menuItems["Select All"].waitForExistence(timeout: 2) { app.menuItems["Select All"].tap() }
    field.typeText(XCUIKeyboardKey.delete.rawValue)
    field.slowType(text)
  }

  func testEditDateAndPercentSplit() throws {
    XCTAssertFalse(LocalAccount.password.isEmpty, "Run through run-edit.sh so the local test password is set")
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.signInFromFreshInstall(email: LocalAccount.ana)

    app.tabBars.buttons["Shared"].waitAndTap()
    app.element(containing: "Edit Trip").waitAndTap(timeout: 15)
    app.buttons["Edit Villa"].waitAndTap(timeout: 15)
    XCTAssertTrue(app.staticTexts["Edit Expense"].waitForExistence(timeout: 5))
    snap("E01-edit-open")

    // Date: open the inline calendar and pick the 1st.
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Date, '")).firstMatch.waitAndTap()
    let first = app.buttons.matching(NSPredicate(format: "label ENDSWITH ' 1' OR label CONTAINS ' 1,'")).firstMatch
    first.waitAndTap()

    // Split: switch to percentages and enter 50 / 30 / 20.
    app.buttons["%"].waitAndTap()
    replace(app.textFields["Percentage for Ana"], with: "50", in: app)
    replace(app.textFields["Percentage for Carla"], with: "30", in: app)
    replace(app.textFields["Percentage for Dina"], with: "20", in: app)
    XCTAssertTrue(app.element(containing: "Adds up to ₱900.00").waitForExistence(timeout: 5))
    snap("E02-edit-percent")
    // Save stays above the decimal pad; tap the one on screen, not a key.
    app.visibleButton("Save").tap()
    // The new date and the 50/30/20 balance show on the group screen.
    XCTAssertTrue(app.element(containing: "10/1/2026").waitForExistence(timeout: 15))
    XCTAssertTrue(app.element(containing: "You are owed ₱450.00").waitForExistence(timeout: 15))
    snap("E03-saved")
  }
}
