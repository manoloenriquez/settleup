import XCTest

/// Budget, signed in (local stack; run-budget.sh seeds Ana with two groups:
/// a ₱300 taxi she paid, split three ways, and ₱1,350 electricity Carla paid,
/// split three ways — Ana's own cost is ₱100 + ₱450). Sets up a ₱60,000 /
/// ₱7,000 budget and checks that only her shares count, then uses the
/// Assistant: today's figure, an affordability question that must not become
/// an expense, and a weekly change applied only after Confirm.
@MainActor
final class BudgetSignedInJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  private func clear(_ field: XCUIElement) {
    field.tap()
    if let value = field.value as? String, !value.isEmpty {
      field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: value.count + 2))
    }
  }

  func testSignedInBudget() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.signInFromFreshInstall(email: LocalAccount.ana)

    app.tabBars.buttons["Spending"].waitAndTap()
    app.buttons["Set Up Budget"].waitAndTap()
    let monthly = app.textFields["Monthly spending limit"]
    XCTAssertTrue(monthly.waitForExistence(timeout: 10))
    if !app.keyboards.firstMatch.exists { monthly.tap() }
    monthly.slowType("60000")
    let weekly = app.textFields["Weekly allowance"]
    clear(weekly)
    weekly.slowType("7000")
    app.navigationBars.buttons["Save"].waitAndTap()

    // ₱7,000 − her ₱100 taxi share − her ₱450 electricity share. Not the ₱300 she paid.
    XCTAssertTrue(app.element(containing: "Left this week: ₱6,450.00").waitForExistence(timeout: 20), "Only her shares count")
    app.swipeUp()
    app.swipeUp()
    XCTAssertTrue(app.element(containing: "your share in Flat 2B").waitForExistence(timeout: 5))
    snap("budget-signed-in-counted")

    // The Assistant answers from the same figures and never turns a question into an expense.
    app.switchTab("Assistant")
    app.sendToAssistant("How much can I safely spend today?")
    XCTAssertTrue(app.element(containing: "is left this week").waitForExistence(timeout: 30))
    snap("budget-assistant-status")
    app.sendToAssistant("Can I afford to spend 4k this weekend?")
    XCTAssertTrue(app.element(containing: "Can I spend ₱4,000.00?").waitForExistence(timeout: 30))
    XCTAssertFalse(app.element(containing: "Add personal expense").exists, "A question is not an expense")
    snap("budget-assistant-afford")

    app.sendToAssistant("Set my weekly budget to 8k")
    XCTAssertTrue(app.element(containing: "Change your budget").waitForExistence(timeout: 30))
    snap("budget-assistant-preview")
    // Nothing changes before Confirm.
    // The Spending tab is still on the budget screen opened earlier.
    app.switchTab("Spending")
    XCTAssertTrue(app.element(containing: "Left this week: ₱6,450.00").waitForExistence(timeout: 10))
    app.switchTab("Assistant")
    app.visibleButton("Confirm").tap()
    XCTAssertTrue(app.element(containing: "Budget updated").waitForExistence(timeout: 10))
    snap("budget-assistant-confirmed")
    app.switchTab("Spending")
    XCTAssertTrue(app.element(containing: "Left this week: ₱7,450.00").waitForExistence(timeout: 10), "₱8,000 − ₱550")
    // Give the background sync a moment before the runner checks the server copy.
    sleep(5)
  }
}
