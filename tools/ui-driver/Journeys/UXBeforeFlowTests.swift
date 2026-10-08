import XCTest

/// The five core flows as the app worked before the October 2026 UX pass
/// (tag `ux-baseline-2026-10-09`). Run with run-flows.sh, which seeds the
/// local stack; each class gets a fresh install. These selectors match the
/// baseline build only — UXAfterFlowTests measures the same tasks today.
///
/// Seeded for Ana (run-flows.sh):
/// - "Weekend Trip": Ana, Carla, Dina (no accounts); Taxi ₱300 paid by Ana, equal.
/// - "Flat 2B": Ana, Carla, Dina; Electricity ₱1,350 paid by Carla, equal → Ana owes Carla ₱450.

extension XCUIApplication {
  var keyboardUp: Bool { keyboards.firstMatch.exists }
}

@MainActor
final class UXBefore1FirstExpenseTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// Flow 1: open the app for the first time and record ₱250 lunch, no account.
  func testFirstExpense() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    let meter = FlowMeter(self, flow: "F1")
    XCTAssertTrue(app.buttons["Get Started"].waitForExistence(timeout: 20))
    meter.screen("welcome")
    meter.tap(app.buttons["Get Started"])
    meter.screen("currency")
    meter.tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Use '")).firstMatch)
    meter.screen("account-choice")
    meter.tap(app.buttons["Continue Without an Account"])
    XCTAssertTrue(app.buttons["Add Expense"].waitForExistence(timeout: 10))
    meter.screen("home")
    meter.tap(app.buttons["Add Expense"])
    let amount = app.textFields["Amount"]
    XCTAssertTrue(amount.waitForExistence(timeout: 5))
    meter.screen("new-expense")
    if app.keyboardUp { meter.typeFocused("250", into: amount) } else { meter.type("250", into: amount) }
    meter.type("Lunch", into: app.textFields["What was it for?"])
    meter.shot("filled")
    meter.tap(app.navigationBars.buttons["Save"])
    XCTAssertTrue(app.element(containing: "Lunch").waitForExistence(timeout: 5))
    meter.screen("saved")
    meter.finish()
  }
}

@MainActor
final class UXBefore2GroupExpenseTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// Flow 2: split a ₱1,200 dinner equally with the Weekend Trip group.
  func testGroupExpense() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.signInFromFreshInstall(email: LocalAccount.ana)
    app.tabBars.buttons["Home"].waitAndTap()
    let meter = FlowMeter(self, flow: "F2")
    XCTAssertTrue(app.buttons["Add an expense"].waitForExistence(timeout: 15))
    sleep(2) // let the group list load
    meter.screen("home")
    meter.tap(app.buttons["Add an expense"])
    meter.screen("add-menu")
    meter.tap(app.buttons["Split with a Group"])
    meter.screen("group-picker")
    meter.tap(app.buttons["Weekend Trip"])
    let amount = app.textFields["Amount"]
    XCTAssertTrue(amount.waitForExistence(timeout: 10))
    meter.screen("add-expense")
    if app.keyboardUp { meter.typeFocused("1200", into: amount) } else { meter.type("1200", into: amount) }
    let description = app.textFields["Description"]
    meter.type("Dinner", into: description)
    description.typeText("\n") // return closes the keyboard (not counted: it is part of typing)
    meter.shot("filled")
    let save = app.buttons["Save expense"]
    meter.scrollTo(save, in: app)
    meter.tap(save)
    meter.screen("confirm")
    meter.tap(app.visibleButton("Confirm & Save"))
    XCTAssertTrue(app.element(containing: "Expense added").waitForExistence(timeout: 10))
    meter.screen("saved")
    meter.finish()
  }
}

@MainActor
final class UXBefore3CreateGroupTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// Flow 3: create "Beach House" and add Carla and Dina, who have no account.
  func testCreateGroup() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.signInFromFreshInstall(email: LocalAccount.ana)
    let meter = FlowMeter(self, flow: "F3")
    meter.tap(app.tabBars.buttons["Shared"])
    meter.screen("shared")
    meter.tap(app.visibleButton("Create or join a group"))
    meter.screen("shared-menu")
    meter.tap(app.visibleButton("Create Group"))
    let name = app.textFields["Group Name"]
    XCTAssertTrue(name.waitForExistence(timeout: 10))
    meter.screen("new-group")
    if app.keyboardUp { meter.typeFocused("Beach House", into: name) } else { meter.type("Beach House", into: name) }
    let me = app.textFields["Your name in this group"]
    if (me.value as? String).map({ $0.isEmpty || $0 == "How others will see you" }) ?? true {
      meter.type("Ana", into: me)
    }
    meter.shot("filled")
    meter.tap(app.visibleButton("Create Group"))
    XCTAssertTrue(app.visibleButton("Add people", timeout: 15).exists)
    meter.screen("group")
    meter.tap(app.visibleButton("Add people"))
    meter.screen("settings-people")
    for person in ["Carla", "Dina"] {
      let field = app.textFields["Member name"]
      XCTAssertTrue(field.waitForExistence(timeout: 10))
      if app.keyboardUp && person == "Carla" { meter.typeFocused(person, into: field) } else { meter.type(person, into: field) }
      meter.tap(app.visibleButton("Add"))
      XCTAssertTrue(app.element(containing: person).waitForExistence(timeout: 10))
    }
    meter.shot("people-added")
    meter.tap(app.navigationBars.buttons.firstMatch)
    XCTAssertTrue(app.staticTexts["Carla"].waitForExistence(timeout: 10))
    meter.screen("group-with-people")
    meter.finish()
  }
}

@MainActor
final class UXBefore4SettleUpTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// Flow 4: open the app, find out what I owe, and record paying Carla back.
  func testSettleUp() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.signInFromFreshInstall(email: LocalAccount.ana)
    app.tabBars.buttons["Home"].waitAndTap()
    let meter = FlowMeter(self, flow: "F4")
    sleep(3) // balances load
    meter.screen("home")
    let balance = app.staticTexts["Your balance with others"]
    let visibleAtLaunch = FlowMeter.isOnScreen(balance, in: app)
    if !visibleAtLaunch {
      meter.scrollTo(balance, in: app)
      meter.shot("home-scrolled-to-balance")
    }
    meter.tap(app.tabBars.buttons["Shared"])
    meter.screen("shared")
    meter.tap(app.element(containing: "Flat 2B"), timeout: 15)
    meter.screen("group")
    meter.tap(app.visibleButton("Balances"))
    meter.screen("balances")
    let settle = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Settle balance'")).firstMatch
    meter.scrollTo(settle, in: app)
    meter.tap(settle)
    XCTAssertTrue(app.element(containing: "Record a Payment").waitForExistence(timeout: 10))
    meter.screen("record-payment")
    meter.tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Record ₱450.00'")).firstMatch)
    XCTAssertTrue(app.element(containing: "Recorded ₱450.00").waitForExistence(timeout: 10))
    meter.screen("recorded")
    meter.finish(note: visibleAtLaunch ? "balance visible at launch" : "balance below the fold at launch")
  }
}

@MainActor
final class UXBefore5FixMistakeTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// Flow 5: the Weekend Trip taxi was ₱350, not ₱300 — correct it.
  func testFixAmount() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.signInFromFreshInstall(email: LocalAccount.ana)
    let meter = FlowMeter(self, flow: "F5")
    meter.tap(app.tabBars.buttons["Shared"])
    meter.screen("shared")
    meter.tap(app.element(containing: "Weekend Trip"), timeout: 15)
    meter.screen("group")
    meter.tap(app.buttons["Edit Taxi"], timeout: 15)
    XCTAssertTrue(app.staticTexts["Edit Expense"].waitForExistence(timeout: 5))
    meter.screen("edit-expense")
    // The edit sheet's fields have no labels: Name, Amount, Notes in order.
    let amount = app.textFields.element(boundBy: 1)
    meter.replace(amount, with: "350", in: app)
    meter.shot("edited")
    meter.tap(app.visibleButton("Save"))
    XCTAssertTrue(app.element(containing: "₱350.00").waitForExistence(timeout: 15))
    meter.screen("saved")
    meter.finish()
  }
}
