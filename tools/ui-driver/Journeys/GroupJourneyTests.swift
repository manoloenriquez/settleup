import XCTest

/// Journey D in the app, signed in: create a group, add two people without
/// accounts, add an expense split equally, record a repayment, then turn the
/// shared link off, back on, and make a new one. Runs against the local
/// Supabase stack as Ana (created by AccountJourneyTests). Fresh install.
@MainActor
final class GroupJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testSignedInGroupJourney() throws {
    XCTAssertFalse(LocalAccount.password.isEmpty, "Run through run.sh so the local test password is set")
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.signInFromFreshInstall(email: LocalAccount.ana)

    // Create the group
    app.tabBars.buttons["Shared"].waitAndTap()
    app.visibleButton("Create or join a group").tap()
    app.visibleButton("Create Group").tap()
    let name = app.textFields["Group Name"]
    name.waitAndTap()
    name.slowType("Boracay Trip")
    let me = app.textFields["Your name in this group"]
    me.tap()
    if let current = me.value as? String, !current.isEmpty, current != "How others will see you" {
      me.press(forDuration: 1.0)
      if app.menuItems["Select All"].waitForExistence(timeout: 2) { app.menuItems["Select All"].tap() }
      me.typeText(XCUIKeyboardKey.delete.rawValue)
    }
    me.slowType("Ana")
    snap("D01-new-group")
    app.visibleButton("Create Group").tap()
    XCTAssertTrue(app.navigationBars["Boracay Trip"].waitForExistence(timeout: 15) || app.staticTexts["Boracay Trip"].waitForExistence(timeout: 5))
    snap("D02-group-created")

    // Add two people who have no account
    app.visibleButton("Add people").tap()
    for person in ["Carla", "Dina"] {
      let field = app.textFields["Member name"]
      field.waitAndTap()
      field.slowType(person)
      app.visibleButton("Add").tap()
      XCTAssertTrue(app.element(containing: person).waitForExistence(timeout: 10))
    }
    snap("D03-members")
    app.navigationBars.buttons.firstMatch.tap()

    // ₱900 dinner, paid by Ana, split equally between the three
    app.buttons["Add expense"].waitAndTap()
    let amount = app.textFields["Amount"]
    amount.waitAndTap()
    amount.slowType("900")
    let description = app.textFields["Description"]
    description.waitAndTap()
    description.slowType("Seafood dinner")
    description.typeText("\n") // return closes the keyboard
    app.swipeUp()
    snap("D04-add-expense")
    app.visibleButton("Save expense").tap()
    app.visibleButton("Confirm & Save").tap()
    XCTAssertTrue(app.element(containing: "Seafood dinner").waitForExistence(timeout: 15))
    XCTAssertTrue(app.element(containing: "600.00").waitForExistence(timeout: 15), "Ana is owed ₱600")
    snap("D05-expense-added")

    // Carla repays her ₱300
    app.visibleButton("Balances").tap()
    snap("D06-balances")
    app.visibleButton("Settle").tap()
    XCTAssertTrue(app.element(containing: "Record a Payment").waitForExistence(timeout: 10))
    snap("D07-settle-up")
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Record'")).firstMatch.waitAndTap()
    XCTAssertTrue(app.element(containing: "300.00").waitForExistence(timeout: 15), "₱300 still owed to Ana")
    snap("D08-after-payment")

    // Shared link: off, on, new link
    app.buttons["Group actions"].waitAndTap()
    app.visibleButton("Group Settings").tap()
    let off = app.buttons["Turn Off Link"]
    for _ in 0..<6 where !off.exists { app.swipeUp() }
    off.waitAndTap()
    app.alerts.buttons["Turn Off"].waitAndTap()
    XCTAssertTrue(app.buttons["Turn On Link"].waitForExistence(timeout: 10))
    snap("D09-link-off")
    app.buttons["Turn On Link"].tap()
    app.alerts.buttons["Turn On"].waitAndTap()
    app.buttons["Make a New Link"].waitAndTap(timeout: 10)
    app.alerts.buttons["Make New Link"].waitAndTap()
    XCTAssertTrue(app.buttons["Turn Off Link"].waitForExistence(timeout: 10))
    snap("D10-new-link")
  }
}
