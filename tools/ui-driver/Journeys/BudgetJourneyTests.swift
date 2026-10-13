import XCTest

/// Budget journey (guest, no account): set up a ₱60,000 / ₱7,000 budget,
/// read today's and this week's figures, record an expense and see the budget
/// line, set money aside, change the recovery setting, read history, relaunch
/// and confirm it persisted. Expects a fresh install. Figures assume the run
/// date's week is the budget's first week (any weekday works for the checks
/// that depend only on what was spent).
@MainActor
final class BudgetJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  private var prefix: String { ProcessInfo.processInfo.environment["SCREEN_PREFIX"].flatMap { $0.isEmpty ? nil : $0 } ?? "budget" }

  private func clear(_ field: XCUIElement) {
    field.tap()
    if let value = field.value as? String, !value.isEmpty {
      field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: value.count + 2))
    }
  }

  func testGuestBudget() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.finishOnboardingAsGuest()

    // Spending tab offers a budget.
    app.tabBars.buttons["Spending"].waitAndTap()
    app.buttons["Set Up Budget"].waitAndTap()

    let monthly = app.textFields["Monthly spending limit"]
    XCTAssertTrue(monthly.waitForExistence(timeout: 10))
    if !app.keyboards.firstMatch.exists { monthly.tap() }
    monthly.slowType("60000")
    // With no history the suggestion is the most that fits a 31-day month.
    XCTAssertTrue(app.element(containing: "The most that fits").waitForExistence(timeout: 5))
    snap("\(prefix)-01-setup-suggested")
    let weekly = app.textFields["Weekly allowance"]
    clear(weekly)
    weekly.slowType("7000")
    XCTAssertTrue(app.element(containing: "Preview. 12–18 Oct: ₱7,000.00").waitForExistence(timeout: 5), "Preview shows this week at ₱7,000")
    snap("\(prefix)-02-setup-preview")
    app.navigationBars.buttons["Save"].waitAndTap()

    // The budget screen: today's, this week's and this month's figures.
    XCTAssertTrue(app.element(containing: "Safe to spend today").waitForExistence(timeout: 10))
    XCTAssertTrue(app.element(containing: "Left this week: ₱7,000.00").waitForExistence(timeout: 5), "A new week has the whole allowance")
    XCTAssertTrue(app.element(containing: "Left this month: ₱60,000.00").exists)
    snap("\(prefix)-03-budget")

    // Record an expense from Home; the toast says what's left this week.
    app.tabBars.buttons["Home"].waitAndTap()
    XCTAssertTrue(app.element(containing: "Budget. Safe today").waitForExistence(timeout: 5), "Home shows the budget card")
    app.buttons["Add Expense"].waitAndTap()
    let amount = app.textFields["Amount"]
    XCTAssertTrue(amount.waitForExistence(timeout: 5))
    if !app.keyboards.firstMatch.exists { amount.tap() }
    amount.slowType("1200")
    let what = app.textFields["What was it for?"]
    what.tap()
    what.slowType("Groceries")
    app.navigationBars.buttons["Save"].waitAndTap()
    XCTAssertTrue(app.element(containing: "₱5,800.00 left this week").waitForExistence(timeout: 5), "Toast shows the week's remainder")
    snap("\(prefix)-04-saved-toast")
    sleep(3)
    snap("\(prefix)-05-home-card")

    // Open the budget from Home: the week went down by exactly the expense.
    app.element(containing: "Budget. Safe today").tap()
    XCTAssertTrue(app.element(containing: "Left this week: ₱5,800.00").waitForExistence(timeout: 10))
    XCTAssertTrue(app.element(containing: "Left this month: ₱58,800.00").exists)

    // Set money aside for a purchase.
    app.buttons["Plan Spending"].waitAndTap()
    let name = app.textFields["What for"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    if !app.keyboards.firstMatch.exists { name.tap() }
    name.slowType("New phone")
    let aside = app.textFields["Amount to set aside"]
    aside.tap()
    aside.slowType("10000")
    snap("\(prefix)-06-plan")
    app.navigationBars.buttons["Save"].waitAndTap()
    XCTAssertTrue(app.element(containing: "Left this month: ₱48,800.00").waitForExistence(timeout: 10), "Set-aside money leaves the month's free amount")
    app.swipeUp()
    XCTAssertTrue(app.element(containing: "New phone").exists)
    snap("\(prefix)-07-budget-set-aside")
    app.swipeUp()
    snap("\(prefix)-08-budget-counted")

    // Spread overspending over 3 weeks.
    app.navigationBars.buttons["Edit"].waitAndTap()
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'More Options'")).firstMatch.waitAndTap()
    app.buttons["3 Weeks"].waitAndTap()
    snap("\(prefix)-09-edit-more")
    app.navigationBars.buttons["Save"].waitAndTap()
    XCTAssertTrue(app.element(containing: "Safe to spend today").waitForExistence(timeout: 10))

    // History.
    app.swipeUp()
    app.swipeUp()
    app.buttons["History"].waitAndTap()
    XCTAssertTrue(app.element(containing: "allowance ₱7,000.00, spent ₱1,200.00").waitForExistence(timeout: 5))
    snap("\(prefix)-10-history")

    // It all survives a relaunch.
    app.terminate()
    app.launch()
    XCTAssertTrue(app.element(containing: "Budget. Safe today").waitForExistence(timeout: 15))
    XCTAssertTrue(app.element(containing: "Left this week: ₱5,800.00").exists)
  }
}
