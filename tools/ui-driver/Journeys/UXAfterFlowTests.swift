import XCTest

/// The same five tasks as UXBeforeFlowTests, on the app after the October
/// 2026 UX pass. Run with `FLOW_PHASE=after run-flows.sh`; same seed data
/// (see UXBeforeFlowTests.swift), fresh install per class.

@MainActor
final class UXAfter1FirstExpenseTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// Flow 1: open the app for the first time and record ₱250 lunch, no account.
  func testFirstExpense() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    let meter = FlowMeter(self, flow: "F1")
    XCTAssertTrue(app.buttons["Get Started"].waitForExistence(timeout: 20))
    meter.screen("welcome")
    meter.tap(app.buttons["Get Started"])
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
final class UXAfter2GroupExpenseTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  private func addGroupExpense(_ app: XCUIApplication, meter: FlowMeter, amount value: String, description: String) {
    let amount = app.textFields["Amount"]
    XCTAssertTrue(amount.waitForExistence(timeout: 10))
    meter.screen("add-expense")
    if app.keyboardUp { meter.typeFocused(value, into: amount) } else { meter.type(value, into: amount) }
    meter.type(description, into: app.textFields["Description"])
    meter.shot("filled")
    meter.tap(app.navigationBars.buttons["Save"])
    XCTAssertTrue(app.element(containing: "Expense added").waitForExistence(timeout: 10))
    meter.screen("saved")
  }

  /// Flow 2: split a ₱1,200 dinner equally with the Weekend Trip group, as a
  /// repeat expense. The first expense in the group is measured separately
  /// (F2-first): it is what teaches the add menu which group is recent.
  func testGroupExpense() throws {
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.signInFromFreshInstall(email: LocalAccount.ana)
    app.tabBars.buttons["Home"].waitAndTap()
    XCTAssertTrue(app.buttons["Add an expense"].waitForExistence(timeout: 15))
    sleep(2) // let the group list load

    let first = FlowMeter(self, flow: "F2-first")
    first.screen("home")
    first.tap(app.buttons["Add an expense"])
    first.screen("add-menu")
    first.tap(app.buttons["Split with a Group"])
    first.screen("group-picker")
    first.tap(app.buttons["Weekend Trip"])
    addGroupExpense(app, meter: first, amount: "300", description: "Snacks")
    first.finish(note: "first expense in a group: no recent group yet")
    sleep(3) // the Undo toast clears

    let meter = FlowMeter(self, flow: "F2")
    meter.screen("home")
    meter.tap(app.buttons["Add an expense"])
    meter.screen("add-menu")
    meter.tap(app.buttons["Split with Weekend Trip"])
    addGroupExpense(app, meter: meter, amount: "1200", description: "Dinner")
    meter.finish(note: "repeat expense: the add menu offers the recent group")
  }
}

@MainActor
final class UXAfter3CreateGroupTests: XCTestCase {
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
    meter.type("Carla, Dina", into: app.textFields["People in this group, separated by commas"])
    meter.shot("filled")
    // The keyboard covers the bottom button; Create is in the header too.
    meter.tap(app.navigationBars.buttons["Create"])
    XCTAssertTrue(app.staticTexts["Carla"].waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts["Dina"].exists)
    meter.screen("group-with-people")
    meter.finish()
  }
}

@MainActor
final class UXAfter4SettleUpTests: XCTestCase {
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
    // Home lists each group with what you owe in it.
    let card = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Flat 2B'")).firstMatch
    if FlowMeter.isOnScreen(card, in: app) {
      meter.tap(card)
    } else {
      meter.tap(app.tabBars.buttons["Shared"])
      meter.screen("shared")
      meter.tap(app.element(containing: "Flat 2B"), timeout: 15)
    }
    XCTAssertTrue(app.element(containing: "You owe ₱450.00").waitForExistence(timeout: 15))
    meter.screen("group")
    meter.tap(app.buttons["Settle up with Carla"])
    XCTAssertTrue(app.element(containing: "Record a Payment").waitForExistence(timeout: 10))
    meter.screen("record-payment")
    meter.tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Record ₱450.00'")).firstMatch)
    XCTAssertTrue(app.element(containing: "Recorded ₱450.00").waitForExistence(timeout: 10))
    meter.screen("recorded")
    meter.finish(note: visibleAtLaunch ? "balance visible at launch" : "balance below the fold at launch")
  }
}

@MainActor
final class UXAfter5FixMistakeTests: XCTestCase {
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
    // The row says who paid and your part, and opens the expense.
    let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Taxi,'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 15))
    XCTAssertTrue(row.label.contains("You paid"), "Row shows the payer: \(row.label)")
    meter.tap(row)
    XCTAssertTrue(app.staticTexts["Edit Expense"].waitForExistence(timeout: 5))
    meter.screen("edit-expense")
    // The amount is selected on focus: typing replaces it.
    meter.type("350", into: app.textFields["Amount"])
    meter.shot("edited")
    meter.tap(app.visibleButton("Save"))
    XCTAssertTrue(app.element(containing: "₱350.00").waitForExistence(timeout: 15))
    meter.screen("saved")
    meter.finish()
  }
}
