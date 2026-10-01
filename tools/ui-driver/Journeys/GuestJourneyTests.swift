import XCTest

/// Journey A: first launch → onboarding → guest → add, edit, delete + undo,
/// relaunch and confirm the data persisted. Expects a fresh install.
@MainActor
final class GuestJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testGuestJourney() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()

    XCTAssertTrue(app.staticTexts["Know where your money goes"].waitForExistence(timeout: 20))
    snap("A01-welcome")
    app.buttons["Get Started"].waitAndTap()
    XCTAssertTrue(app.staticTexts["Your main currency"].waitForExistence(timeout: 5))
    snap("A02-currency")
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Use '")).firstMatch.waitAndTap()
    XCTAssertTrue(app.staticTexts["An account is optional"].waitForExistence(timeout: 5))
    snap("A03-account")
    app.buttons["Continue Without an Account"].waitAndTap()

    // Home
    XCTAssertTrue(app.buttons["Add Expense"].waitForExistence(timeout: 10))
    snap("A04-home-empty")

    // Add a manual expense
    app.buttons["Add Expense"].tap()
    let amount = app.textFields["Amount"]
    XCTAssertTrue(amount.waitForExistence(timeout: 5))
    amount.tap()
    amount.slowType("250")
    let description = app.textFields["What was it for?"]
    description.tap()
    description.slowType("Lunch at Jollibee")
    snap("A05-new-expense")
    app.navigationBars.buttons["Save"].waitAndTap()
    XCTAssertTrue(app.element(containing: "Lunch at Jollibee").waitForExistence(timeout: 5))
    snap("A06-home-one-expense")

    // Edit it
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Lunch at Jollibee'")).firstMatch.waitAndTap()
    let editAmount = app.textFields["Amount"]
    XCTAssertTrue(editAmount.waitForExistence(timeout: 5))
    editAmount.tap()
    editAmount.press(forDuration: 1.0)
    if app.menuItems["Select All"].waitForExistence(timeout: 2) { app.menuItems["Select All"].tap() }
    editAmount.typeText(XCUIKeyboardKey.delete.rawValue)
    editAmount.slowType("275.50")
    snap("A07-edit-expense")
    app.navigationBars.buttons["Save"].waitAndTap()
    XCTAssertTrue(app.element(containing: "₱275.50").waitForExistence(timeout: 5))

    // Spending tab
    app.tabBars.buttons["Spending"].waitAndTap()
    XCTAssertTrue(app.element(containing: "Lunch at Jollibee").waitForExistence(timeout: 5))
    snap("A08-spending")

    // Shared tab explains accounts
    app.tabBars.buttons["Shared"].waitAndTap()
    XCTAssertTrue(app.staticTexts["Share expenses with an account"].waitForExistence(timeout: 5))
    snap("A09-shared-guest")

    // Account tab
    app.tabBars.buttons["Account"].waitAndTap()
    XCTAssertTrue(app.staticTexts["You’re using Talli without an account"].waitForExistence(timeout: 5))
    snap("A10-account-guest")

    // Delete with undo
    app.tabBars.buttons["Spending"].waitAndTap()
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Lunch at Jollibee'")).firstMatch.waitAndTap()
    app.buttons["Delete Expense"].waitAndTap()
    XCTAssertTrue(app.buttons["Undo"].waitForExistence(timeout: 3))
    snap("A11-deleted-undo")
    app.buttons["Undo"].tap()
    XCTAssertTrue(app.element(containing: "Lunch at Jollibee").waitForExistence(timeout: 5))

    // Relaunch: data persists, onboarding is not shown again
    app.terminate()
    app.launch()
    XCTAssertTrue(app.buttons["Add Expense"].waitForExistence(timeout: 20))
    XCTAssertTrue(app.element(containing: "Lunch at Jollibee").waitForExistence(timeout: 5))
    snap("A12-relaunched")
  }
}
