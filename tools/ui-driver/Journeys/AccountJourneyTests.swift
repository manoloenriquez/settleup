import XCTest

/// Journey B in the app: expenses added without an account move into a new
/// account after sign-up, once, with the person's consent. Runs against the
/// local Supabase stack. Expects a fresh install.
@MainActor
final class AccountJourneyTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testGuestExpensesJoinNewAccount() throws {
    XCTAssertFalse(LocalAccount.password.isEmpty, "Run through run.sh so the local test password is set")
    let app = XCUIApplication(bundleIdentifier: talliBundleID)
    app.launch()
    app.finishOnboardingAsGuest()
    app.addPersonalExpense(amount: "180", description: "Taxi to Makati")
    app.addPersonalExpense(amount: "95.50", description: "Coffee")
    snap("B01-guest-two-expenses")

    // Create an account from the Account tab
    app.tabBars.buttons["Account"].waitAndTap()
    app.buttons["Create Account"].waitAndTap()
    let email = app.textFields["Email"]
    XCTAssertTrue(email.waitForExistence(timeout: 10))
    email.tap()
    email.slowType(LocalAccount.newAccount)
    // Reveal both password fields first: iOS only offers (and swaps in) a
    // strong password on secure fields.
    for _ in 0..<2 { app.buttons["Show password"].firstMatch.waitAndTap() }
    let password = app.textFields["Password"]
    password.waitAndTap()
    password.slowType(LocalAccount.password)
    let confirm = app.textFields["Confirm password"]
    confirm.waitAndTap()
    confirm.slowType(LocalAccount.password)
    snap("B02-register")
    app.buttons["Create account"].waitAndTap()

    // Consent prompt: nothing moves without a yes
    let prompt = app.alerts["Add 2 expenses to your account?"]
    XCTAssertTrue(prompt.waitForExistence(timeout: 20))
    snap("B03-import-prompt")
    prompt.buttons["Add to My Account"].firstMatch.tap()

    XCTAssertTrue(app.element(containing: "added to your account").waitForExistence(timeout: 15))
    snap("B04-imported")
    app.tabBars.buttons["Spending"].waitAndTap()
    XCTAssertTrue(app.element(containing: "Taxi to Makati").waitForExistence(timeout: 10))
    XCTAssertTrue(app.element(containing: "Coffee").exists)
    snap("B05-spending-signed-in")

    // Relaunch: still signed in, no second prompt, expenses still there
    app.terminate()
    app.launch()
    app.tabBars.buttons["Spending"].waitAndTap(timeout: 20)
    XCTAssertTrue(app.element(containing: "Taxi to Makati").waitForExistence(timeout: 10))
    XCTAssertFalse(app.alerts.firstMatch.waitForExistence(timeout: 3), "Import prompt should not repeat")
    snap("B06-relaunched")
  }
}
