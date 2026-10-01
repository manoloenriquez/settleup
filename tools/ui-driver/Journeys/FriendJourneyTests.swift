import XCTest

/// Journey C in the app: Ben (local account) sends a friend invite; Ana opens
/// the link, accepts, adds a ₱2,000 dinner split equally (Ben owes ₱1,000),
/// then records Ben's repayment so the ledger is settled. The invite token
/// comes from run-friend.sh via TEST_RUNNER_FRIEND_TOKEN. Fresh install.
@MainActor
final class FriendJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testFriendInviteSplitAndSettle() throws {
    let token = ProcessInfo.processInfo.environment["FRIEND_TOKEN"] ?? ""
    XCTAssertEqual(token.count, 64, "Run through run-friend.sh so an invite token is set")
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.signInFromFreshInstall(email: LocalAccount.ana)

    app.open(URL(string: "talli://friend?token=\(token)")!)
    let accept = app.buttons["Add Ben as a Friend"]
    XCTAssertTrue(accept.waitForExistence(timeout: 20))
    snap("C01-invite")
    let name = app.textFields["Your name for this friend"]
    if name.exists, (name.value as? String ?? "").isEmpty || name.value as? String == "How they know you" {
      name.tap()
      name.slowType("Ana")
    }
    accept.tap()

    // Lands in the two-person ledger
    XCTAssertTrue(app.buttons["Add expense"].waitForExistence(timeout: 20))
    snap("C02-friend-ledger")
    app.buttons["Add expense"].tap()
    let amount = app.textFields["Amount"]
    amount.waitAndTap()
    amount.slowType("2000")
    let description = app.textFields["Description"]
    description.waitAndTap()
    description.slowType("Dinner at Manam")
    description.typeText("\n")
    app.swipeUp()
    app.visibleButton("Save expense").tap()
    app.visibleButton("Confirm & Save").tap()
    XCTAssertTrue(app.element(containing: "Dinner at Manam").waitForExistence(timeout: 15))
    XCTAssertTrue(app.element(containing: "1,000.00").waitForExistence(timeout: 15), "Ben owes Ana ₱1,000")
    snap("C03-ben-owes")

    // Ben pays Ana back
    app.visibleButton("Balances").tap()
    app.visibleButton("Settle").tap()
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Record'")).firstMatch.waitAndTap()
    XCTAssertTrue(app.element(containing: "All settled").waitForExistence(timeout: 15))
    snap("C04-settled")

    // Not a dead end: back goes to the Shared tab, where Ben is a friend.
    let back = app.navigationBars.buttons.element(boundBy: 0)
    XCTAssertTrue(back.waitForExistence(timeout: 5), "The friend ledger needs a way back")
    back.tap()
    XCTAssertTrue(app.visibleButton("Friends").waitForExistence(timeout: 10), "Back should land on the Shared tab")
    app.visibleButton("Friends").tap()
    XCTAssertTrue(app.element(containing: "Ben").waitForExistence(timeout: 10))
    snap("C05-friends")
  }
}
