import XCTest

/// Screenshot tour of the main screens for an appearance review. Run once in
/// light and once in dark (simctl ui <udid> appearance light|dark); the
/// SCREEN_PREFIX env var names the set. Signs in as Ben (seeded local data).
@MainActor
final class AppearanceTourTests: XCTestCase {
  override func setUp() { continueAfterFailure = true }

  func testTour() throws {
    let prefix = ProcessInfo.processInfo.environment["SCREEN_PREFIX"] ?? "tour"
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    if app.buttons["Get Started"].waitForExistence(timeout: 10) {
      app.signInFromFreshInstall(email: LocalAccount.ben)
    }
    func shot(_ name: String) { sleep(2); snap("\(prefix)-\(name)") }
    app.tabBars.buttons["Home"].waitAndTap(); shot("01-home")
    app.swipeUp(); shot("02-home-lower")
    app.tabBars.buttons["Spending"].waitAndTap(); shot("03-spending")
    app.tabBars.buttons["Shared"].waitAndTap(); shot("04-shared")
    app.visibleButton("Friends").tap(); shot("05-friends")
    app.visibleButton("Groups").tap()
    app.element(containing: "Bali trip").waitAndTap(); shot("06-group")
    app.visibleButton("Balances").tap(); shot("07-balances")
    app.visibleButton("Add expense").tap(); shot("08-add-group-expense")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    app.navigationBars.buttons.element(boundBy: 0).tap()
    app.tabBars.buttons["Account"].waitAndTap(); shot("09-account")
    app.element(containing: "Payment Details").waitAndTap(); shot("10-payment")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    app.tabBars.buttons["Home"].waitAndTap()
    app.buttons["Add Expense"].firstMatch.waitAndTap(); shot("11-new-expense")
  }
}
