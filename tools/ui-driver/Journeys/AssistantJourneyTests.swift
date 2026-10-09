import XCTest

/// Talli Assistant in the app. Guest: add a personal expense by message,
/// confirm, undo, ask a spending question. Signed in (local stack, Ana with the
/// "Assistant Trip" group seeded by run-assistant.sh): add a group expense,
/// ask a balance question, record a payment, and check nothing saves without
/// Confirm. Fresh install per test.
extension XCUIApplication {
  /// The chat keeps the keyboard up after sending; tap the title to put it away
  /// before using the tab bar.
  func dismissAssistantKeyboard() {
    if keyboards.count > 0 { swipeDown() }
  }

  func switchTab(_ name: String) {
    dismissAssistantKeyboard()
    tabBars.buttons[name].waitAndTap()
  }

  func sendToAssistant(_ text: String) {
    let field = descendants(matching: .any).matching(identifier: "assistant-input").firstMatch
    field.waitAndTap(timeout: 15)
    field.slowType(text)
    descendants(matching: .any).matching(identifier: "assistant-send").firstMatch.waitAndTap()
  }
}

@MainActor
final class AssistantGuestJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }
  private func send(_ app: XCUIApplication, _ text: String) { app.sendToAssistant(text) }

  func testGuestAssistant() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.finishOnboardingAsGuest()

    app.switchTab("Assistant")
    XCTAssertTrue(app.staticTexts["Ask Talli"].waitForExistence(timeout: 10))
    snap("AI01-empty")

    send(app, "I paid 180 for coffee")
    XCTAssertTrue(app.element(containing: "Add personal expense").waitForExistence(timeout: 30))
    XCTAssertTrue(app.element(containing: "₱180.00").exists)
    snap("AI02-proposal")
    // Not saved until confirmed.
    app.switchTab("Spending")
    XCTAssertFalse(app.element(containing: "Coffee").waitForExistence(timeout: 2))
    app.switchTab("Assistant")

    app.visibleButton("Confirm").tap()
    XCTAssertTrue(app.element(containing: "Saved to your expenses").waitForExistence(timeout: 10))
    snap("AI03-saved")
    app.switchTab("Spending")
    XCTAssertTrue(app.element(containing: "Coffee").waitForExistence(timeout: 5))

    app.switchTab("Assistant")
    app.visibleButton("Undo").tap()
    XCTAssertTrue(app.element(containing: "Undone").waitForExistence(timeout: 10))
    app.switchTab("Spending")
    XCTAssertFalse(app.element(containing: "Coffee").waitForExistence(timeout: 3))

    app.switchTab("Assistant")
    send(app, "How much did I spend this month?")
    XCTAssertTrue(app.element(containing: "You have no personal expenses this month").waitForExistence(timeout: 30))
    send(app, "Split 600 for lunch with Ana")
    XCTAssertTrue(app.element(containing: "needs an account").waitForExistence(timeout: 30))
    snap("AI04-guest-limits")

    // A guest can change and delete their own expenses (no account needed).
    send(app, "I paid 250 for lunch")
    XCTAssertTrue(app.element(containing: "Add personal expense").waitForExistence(timeout: 30))
    app.visibleButton("Confirm").tap()
    XCTAssertTrue(app.element(containing: "Saved to your expenses").waitForExistence(timeout: 10))
    send(app, "Change the lunch to 275")
    XCTAssertTrue(app.element(containing: "Change expense").waitForExistence(timeout: 30))
    XCTAssertTrue(app.element(containing: "₱275.00").exists)
    app.visibleButton("Confirm").tap()
    XCTAssertTrue(app.element(containing: "Expense updated").waitForExistence(timeout: 10))
    snap("AI06-guest-edit")
    send(app, "Delete the lunch")
    XCTAssertTrue(app.element(containing: "Delete expense").waitForExistence(timeout: 30))
    app.visibleButton("Delete").tap()
    XCTAssertTrue(app.element(containing: "Expense deleted").waitForExistence(timeout: 10))
    app.visibleButton("Undo").tap()
    XCTAssertTrue(app.element(containing: "the expense is back").waitForExistence(timeout: 10))
    app.switchTab("Spending")
    XCTAssertTrue(app.element(containing: "₱275.00").waitForExistence(timeout: 5), "Undo restored the edited lunch")
    app.switchTab("Assistant")

    // Edit opens the normal form with the suggestion filled in; nothing is saved.
    send(app, "I paid 99 for snacks")
    XCTAssertTrue(app.element(containing: "Add personal expense").waitForExistence(timeout: 30))
    app.visibleButton("Edit").tap()
    let amount = app.textFields["Amount"]
    XCTAssertTrue(amount.waitForExistence(timeout: 10))
    XCTAssertEqual(amount.value as? String, "99.00")
    snap("AI07-guest-edit-in-form")
    app.navigationBars.buttons["Cancel"].tap()
    if app.alerts.buttons["Discard"].waitForExistence(timeout: 3) { app.alerts.buttons["Discard"].tap() }
    XCTAssertTrue(app.element(containing: "Opened in the form").waitForExistence(timeout: 10))

    // The conversation survives a relaunch (text only).
    app.terminate()
    app.launch()
    app.switchTab("Assistant")
    XCTAssertTrue(app.element(containing: "I paid 180 for coffee").waitForExistence(timeout: 10))
    snap("AI05-restored")
  }

}

@MainActor
final class AssistantSignedInJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }
  private func send(_ app: XCUIApplication, _ text: String) { app.sendToAssistant(text) }

  func testSignedInAssistant() throws {
    XCTAssertFalse(LocalAccount.password.isEmpty, "Run through run-assistant.sh so the local test password is set")
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.signInFromFreshInstall(email: LocalAccount.ana)

    app.switchTab("Assistant")
    send(app, "I paid 900 for dinner with Carla and Dina in Assistant Trip")
    XCTAssertTrue(app.element(containing: "Add expense").waitForExistence(timeout: 30))
    XCTAssertTrue(app.element(containing: "₱300.00").exists)
    snap("AI11-group-proposal")
    app.visibleButton("Confirm").tap()
    XCTAssertTrue(app.element(containing: "Expense added").waitForExistence(timeout: 15))
    snap("AI12-group-saved")

    send(app, "How much does Carla owe me?")
    XCTAssertTrue(app.element(containing: "Carla owes you").waitForExistence(timeout: 30))
    snap("AI13-balance")

    send(app, "Carla paid me 300")
    XCTAssertTrue(app.element(containing: "Record payment").waitForExistence(timeout: 30))
    app.visibleButton("Confirm").tap()
    XCTAssertTrue(app.element(containing: "Payment recorded").waitForExistence(timeout: 15))
    snap("AI14-payment")

    // A preview that is cancelled saves nothing.
    send(app, "Dina owes me 5,000 for the hotel")
    XCTAssertTrue(app.element(containing: "Add expense").waitForExistence(timeout: 30))
    app.visibleButton("Cancel").tap()
    XCTAssertTrue(app.element(containing: "nothing was saved").waitForExistence(timeout: 5))
    snap("AI15-cancelled")

    // Settle up in full: the amount comes from the balance (Dina owes ₱300).
    send(app, "Settle up with Dina in Assistant Trip")
    XCTAssertTrue(app.element(containing: "full balance").waitForExistence(timeout: 30))
    XCTAssertTrue(app.element(containing: "₱300.00").exists)
    snap("AI16-settle-full")
    app.visibleButton("Confirm").tap()
    XCTAssertTrue(app.element(containing: "Payment recorded").waitForExistence(timeout: 15))

    // Edit opens Add Expense with the suggestion filled in.
    send(app, "I paid 600 for taxi with Carla in Assistant Trip")
    XCTAssertTrue(app.element(containing: "Add expense").waitForExistence(timeout: 30))
    app.visibleButton("Edit").tap()
    let amount = app.textFields["Amount"]
    XCTAssertTrue(amount.waitForExistence(timeout: 15))
    XCTAssertEqual(amount.value as? String, "600.00")
    snap("AI17-group-edit-in-form")
  }
}
