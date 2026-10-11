import XCTest

/// Dynamic Type spot check: run with the simulator at an accessibility text
/// size; screenshots show whether buttons and fields grow instead of clipping.
@MainActor
final class LargeTextTests: XCTestCase {
  func testLargeTextScreens() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    if app.buttons["Get Started"].waitForExistence(timeout: 10) {
      app.signInFromFreshInstall(email: LocalAccount.ben)
      app.tabBars.buttons["Home"].waitAndTap()
    }
    sleep(4)
    snap("L01-home-large-text")
    app.tabBars.buttons["Account"].tap()
    sleep(2)
    app.element(containing: "Payment Details").tap()
    sleep(3)
    snap("L02-payment-large-text")
  }
}
