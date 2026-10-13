import XCTest

/// Budget screens for an appearance review: run with the simulator in dark
/// mode and/or at an accessibility text size (simctl ui appearance / content_size);
/// SCREEN_PREFIX names the set. Guest, fresh install: sets up a budget with
/// one expense and an over-spent week so warnings show.
@MainActor
final class BudgetAppearanceTests: XCTestCase {
  override func setUp() { continueAfterFailure = true }

  func testBudgetScreens() throws {
    let prefix = ProcessInfo.processInfo.environment["SCREEN_PREFIX"].flatMap { $0.isEmpty ? nil : $0 } ?? "budget-look"
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.finishOnboardingAsGuest()
    func shot(_ name: String) { sleep(2); snap("\(prefix)-\(name)") }

    app.addPersonalExpense(amount: "8000", description: "Concert tickets")
    app.tabBars.buttons["Spending"].waitAndTap()
    shot("01-spending-prompt")
    app.buttons["Set Up Budget"].waitAndTap()
    let monthly = app.textFields["Monthly spending limit"]
    XCTAssertTrue(monthly.waitForExistence(timeout: 10))
    if !app.keyboards.firstMatch.exists { monthly.tap() }
    monthly.slowType("30000")
    shot("02-setup")
    app.navigationBars.buttons["Save"].waitAndTap()
    XCTAssertTrue(app.element(containing: "Safe to spend today").waitForExistence(timeout: 10))
    shot("03-budget-top")
    app.swipeUp()
    shot("04-budget-middle")
    app.swipeUp()
    shot("05-budget-bottom")
    app.tabBars.buttons["Home"].waitAndTap()
    shot("06-home-card")
  }
}
