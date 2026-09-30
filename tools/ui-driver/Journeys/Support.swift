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
