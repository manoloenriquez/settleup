import XCTest

/// Payment details, signed in: save GCash details, opt in to showing them on
/// shared links, leave and come back to confirm they stuck. run-payment.sh
/// checks the stored row afterwards. Fresh install, local stack, as Ana.
@MainActor
final class PaymentDetailsTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testSavePaymentDetails() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.signInFromFreshInstall(email: LocalAccount.ana)

    app.tabBars.buttons["Account"].waitAndTap()
    app.element(containing: "Payment Details").waitAndTap()
    let name = app.textFields["GCash Name"]
    name.waitAndTap()
    name.slowType("Ana Cruz")
    let number = app.textFields["GCash Number"]
    number.waitAndTap()
    number.slowType("09171234567")
    number.typeText("\n")
    let share = app.switches["Show payment details on shared group links"]
    for _ in 0..<4 where !share.isHittable { app.swipeUp() }
    if (share.value as? String) != "1" { share.tap() }
    snap("P01-payment-details")
    let save = app.buttons["Save Payment Details"]
    for _ in 0..<6 where !save.isHittable { app.swipeUp() }
    XCTAssertTrue(save.isHittable, "Save must be reachable above the tab bar")
    snap("P01b-save-reachable")
    save.tap()
    sleep(3)

    // Leave and come back: the saved values load from the server.
    app.navigationBars.buttons.element(boundBy: 0).tap()
    app.element(containing: "Payment Details").waitAndTap()
    XCTAssertTrue(app.textFields["GCash Name"].waitForExistence(timeout: 10))
    let reloaded = app.textFields["GCash Name"].value as? String
    XCTAssertEqual(reloaded, "Ana Cruz")
    snap("P02-payment-details-reloaded")
  }
}
