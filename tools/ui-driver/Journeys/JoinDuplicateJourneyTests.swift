import XCTest

/// Joining with a group code when the organizer already listed you by name.
/// run-join.sh seeds "Join Check" (owner Ana) with "Ben" who has no account,
/// then Ben joins with the code: the app warns before adding a second Ben.
/// "Don't Join" adds nobody; "Join as a New Member" still works.
@MainActor
final class JoinDuplicateJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  private func enterCode(_ app: XCUIApplication, _ code: String) {
    app.tabBars.buttons["Shared"].waitAndTap()
    app.visibleButton("Create or join a group").tap()
    app.visibleButton("Join with an Invite Code").tap()
    let field = app.textFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 10))
    field.slowType(code)
    app.visibleButton("Join Group").tap()
  }

  func testWarnsBeforeAddingASecondPerson() throws {
    let code = ProcessInfo.processInfo.environment["JOIN_CODE"] ?? ""
    XCTAssertFalse(code.isEmpty, "Run through run-join.sh")
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.signInFromFreshInstall(email: LocalAccount.ben)

    enterCode(app, code)
    let warning = app.alerts.firstMatch
    XCTAssertTrue(warning.waitForExistence(timeout: 15), "Expected the same-name warning")
    XCTAssertTrue(warning.label.contains("already a"), "Warning title: \(warning.label)")
    snap("J01-same-name-warning")
    warning.buttons["Don’t Join"].tap()
    XCTAssertTrue(app.visibleButton("Join Group").exists, "Stays on the join screen")
    snap("J02-did-not-join")

    app.visibleButton("Join Group").tap()
    XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 15))
    app.alerts.firstMatch.buttons["Join as a New Member"].tap()
    XCTAssertTrue(app.navigationBars["Join Check"].waitForExistence(timeout: 15) || app.staticTexts["Join Check"].waitForExistence(timeout: 5))
    snap("J03-joined-as-new")

    // The same code again: already a member, so it just opens the group.
    app.navigationBars.buttons.element(boundBy: 0).tap()
    enterCode(app, code)
    XCTAssertTrue(app.element(containing: "already in Join Check").waitForExistence(timeout: 15))
    XCTAssertFalse(app.alerts.firstMatch.exists, "No warning for someone already in the group")
  }
}
