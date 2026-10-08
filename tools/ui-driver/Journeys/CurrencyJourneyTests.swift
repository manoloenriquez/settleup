import XCTest

/// Journey F: PHP default, then a USD and a JPY expense. Each keeps its own
/// currency and decimals, and totals are never added across currencies.
@MainActor
final class CurrencyJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  private func completeOnboardingIfShown(_ app: XCUIApplication) {
    guard app.buttons["Get Started"].waitForExistence(timeout: 8) else { return }
    app.buttons["Get Started"].tap()
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Use '")).firstMatch.waitAndTap()
    app.buttons["Continue Without an Account"].waitAndTap()
  }

  private func addExpense(_ app: XCUIApplication, amount: String, description: String, currency: String?) {
    app.buttons["Add Expense"].waitAndTap()
    if let currency {
      app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Currency '")).firstMatch.waitAndTap()
      let search = app.searchFields.firstMatch.exists ? app.searchFields.firstMatch : app.textFields["Search currencies"]
      XCTAssertTrue(search.waitForExistence(timeout: 5))
      search.tap()
      search.slowType(currency)
      app.buttons.matching(NSPredicate(format: "label ENDSWITH %@", ", \(currency)")).firstMatch.waitAndTap()
    }
    let amountField = app.textFields["Amount"]
    XCTAssertTrue(amountField.waitForExistence(timeout: 5))
    amountField.tap()
    amountField.slowType(amount)
    let descriptionField = app.textFields["What was it for?"]
    descriptionField.tap()
    descriptionField.slowType(description)
    app.navigationBars.buttons["Save"].waitAndTap()
    XCTAssertTrue(app.element(containing: description).waitForExistence(timeout: 5))
  }

  func testMultipleCurrencies() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    completeOnboardingIfShown(app)
    XCTAssertTrue(app.buttons["Add Expense"].waitForExistence(timeout: 15))

    addExpense(app, amount: "12.50", description: "Airport taxi", currency: "USD")
    addExpense(app, amount: "1500", description: "Ichiran ramen", currency: "JPY")
    snap("F01-home-currencies")

    // Each expense shows in its own currency with its own decimals.
    XCTAssertTrue(app.element(containing: "$12.50").waitForExistence(timeout: 5))
    XCTAssertTrue(app.element(containing: "¥1,500").exists)
    XCTAssertFalse(app.element(containing: "¥1,500.00").exists, "JPY has no decimals")

    app.tabBars.buttons["Spending"].waitAndTap()
    XCTAssertTrue(app.element(containing: "Ichiran ramen").waitForExistence(timeout: 5))
    snap("F02-spending-currencies")
  }
}
