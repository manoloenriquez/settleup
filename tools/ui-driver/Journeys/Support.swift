import XCTest

let talliBundleID = "com.manoloenriquez.talli"

extension XCTestCase {
  /// Saves a PNG to $SCREENSHOT_DIR (the host path given by the runner) and attaches it.
  @MainActor
  func snap(_ name: String) {
    let shot = XCUIScreen.main.screenshot()
    let attachment = XCTAttachment(screenshot: shot)
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
    if let dir = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"] {
      try? shot.pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
    }
  }
}

extension XCUIApplication {
  /// Any element whose accessibility label contains `text` (rows merge their children into one label).
  func element(containing text: String) -> XCUIElement {
    descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
  }
}

extension XCUIElement {
  /// React Native controlled inputs can drop keys when XCUITest types at full
  /// speed; type one character at a time.
  func slowType(_ text: String) {
    for character in text {
      typeText(String(character))
      usleep(40_000)
    }
  }

  @discardableResult
  func waitAndTap(timeout: TimeInterval = 10, file: StaticString = #filePath, line: UInt = #line) -> XCUIElement {
    XCTAssertTrue(waitForExistence(timeout: timeout), "Missing \(self)", file: file, line: line)
    tap()
    return self
  }
}

/// Local-stack test accounts. The password comes from the runner
/// (TEST_RUNNER_LOCAL_TEST_PASSWORD, read from local-test-accounts.env); the
/// accounts only ever exist on the local Supabase stack.
enum LocalAccount {
  static var password: String { ProcessInfo.processInfo.environment["LOCAL_TEST_PASSWORD"] ?? "" }
  static let ana = "ana@talli.test"
  /// Address for journeys that create an account; the runner can pass a fresh
  /// one (NEW_ACCOUNT_EMAIL) so a re-run on the same local stack still signs up.
  static var newAccount: String { ProcessInfo.processInfo.environment["NEW_ACCOUNT_EMAIL"].flatMap { $0.isEmpty ? nil : $0 } ?? ana }
  static let ben = "ben@talli.test"
}

extension XCUIApplication {
  /// The on-screen button with this label (screens lower in a stack keep theirs).
  func visibleButton(_ label: String, timeout: TimeInterval = 10) -> XCUIElement {
    let deadline = Date().addingTimeInterval(timeout)
    repeat {
      if let hit = buttons.matching(identifier: label).allElementsBoundByIndex.last(where: { $0.exists && $0.isHittable }) {
        return hit
      }
      usleep(300_000)
    } while Date() < deadline
    XCTFail("No visible \"\(label)\" button")
    return buttons[label]
  }

  /// First launch: onboarding with the suggested currency, no account.
  func finishOnboardingAsGuest() {
    XCTAssertTrue(buttons["Get Started"].waitForExistence(timeout: 20))
    buttons["Get Started"].tap()
    buttons.matching(NSPredicate(format: "label BEGINSWITH 'Use '")).firstMatch.waitAndTap()
    buttons["Continue Without an Account"].waitAndTap()
    XCTAssertTrue(buttons["Add Expense"].waitForExistence(timeout: 10))
  }

  func addPersonalExpense(amount: String, description: String) {
    buttons["Add Expense"].waitAndTap()
    let field = textFields["Amount"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.tap()
    field.slowType(amount)
    let what = textFields["What was it for?"]
    what.tap()
    what.slowType(description)
    navigationBars.buttons["Save"].waitAndTap()
    XCTAssertTrue(element(containing: description).waitForExistence(timeout: 5))
  }

  /// iOS offers a strong password on new-password fields; decline it so the
  /// typed test password is used.
  func dismissStrongPasswordOffer() {
    for label in ["Choose My Own Password", "Other Options…", "Not Now"] where buttons[label].exists {
      buttons[label].tap()
    }
  }

  /// Fresh install: onboarding as a guest, then sign in from the Account tab.
  func signInFromFreshInstall(email: String) {
    finishOnboardingAsGuest()
    tabBars.buttons["Account"].waitAndTap()
    buttons["Sign In"].waitAndTap()
    signIn(email: email)
    // Signing in returns to Home; the Account tab then shows the email.
    XCTAssertTrue(tabBars.buttons["Account"].waitForExistence(timeout: 20))
    var signedIn = false
    for _ in 0..<5 where !signedIn {
      sleep(2)
      tabBars.buttons["Account"].tap()
      signedIn = staticTexts.matching(NSPredicate(format: "label CONTAINS %@", email)).firstMatch.waitForExistence(timeout: 4)
    }
    XCTAssertTrue(signedIn, "Not signed in as \(email)")
    // Relaunch once so the signed-in app starts from a single, clean tab bar.
    terminate()
    launch()
    XCTAssertTrue(tabBars.buttons["Shared"].waitForExistence(timeout: 20))
  }

  func signIn(email: String) {
    let emailField = textFields["Email"]
    XCTAssertTrue(emailField.waitForExistence(timeout: 10))
    emailField.tap()
    emailField.slowType(email)
    let password = secureTextFields["Password"]
    password.tap()
    password.typeText(LocalAccount.password)
    buttons["Sign in"].waitAndTap()
    // iOS offers to save the password in a sheet that swallows the next tap.
    let notNow = buttons["Not Now"]
    if notNow.waitForExistence(timeout: 6) { notNow.tap() }
  }
}
