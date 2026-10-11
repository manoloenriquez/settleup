import XCTest

/// Counts what a person has to do in a flow: taps, fields typed into,
/// characters typed, scrolls and screens seen. Screenshots are named
/// `<phase>-<flow>-<nn>-<screen>.png`, and one JSON line per flow is appended
/// to `$SCREENSHOT_DIR/flows-<phase>.jsonl` (see docs/ux-validation-report.md).
///
/// Only the person's actions are counted; setup (install, sign-in, seeding)
/// happens before `FlowMeter` is created. The wall time is how long the
/// automation took (it types slowly and waits for the network), not a human
/// task time; the report estimates human time from the counts instead.
@MainActor
final class FlowMeter {
  let phase: String
  let flow: String
  private let test: XCTestCase
  private(set) var taps = 0
  private(set) var fields = 0
  private(set) var keystrokes = 0
  private(set) var scrolls = 0
  private(set) var screens: [String] = []
  private let started = Date()

  init(_ test: XCTestCase, flow: String) {
    self.test = test
    self.flow = flow
    phase = ProcessInfo.processInfo.environment["FLOW_PHASE"].flatMap { $0.isEmpty ? nil : $0 } ?? "before"
  }

  /// A new screen, sheet or menu the person has to read. Takes a screenshot.
  func screen(_ name: String) {
    screens.append(name)
    test.snap(String(format: "%@-%@-%02d-%@", phase, flow, screens.count, name))
  }

  /// A screenshot of the current state without counting a new screen.
  func shot(_ name: String) {
    test.snap(String(format: "%@-%@-%02d-%@", phase, flow, screens.count, name))
  }

  func tap(_ element: XCUIElement, timeout: TimeInterval = 10, file: StaticString = #filePath, line: UInt = #line) {
    element.waitAndTap(timeout: timeout, file: file, line: line)
    taps += 1
  }

  /// Taps a field and types into it (one tap, one field, `text.count` keys).
  func type(_ text: String, into field: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
    field.waitAndTap(file: file, line: line)
    taps += 1
    typeFocused(text, into: field)
  }

  /// Types into a field that already has focus (autofocus): no tap.
  func typeFocused(_ text: String, into field: XCUIElement) {
    fields += 1
    keystrokes += text.count
    field.slowType(text)
  }

  /// Clears a field and types a new value (tap, select all, delete, type).
  func replace(_ field: XCUIElement, with text: String, in app: XCUIApplication) {
    field.waitAndTap()
    field.press(forDuration: 1.0)
    taps += 1
    if app.menuItems["Select All"].waitForExistence(timeout: 2) {
      app.menuItems["Select All"].tap()
      taps += 1
    }
    field.typeText(XCUIKeyboardKey.delete.rawValue)
    keystrokes += 1
    fields += 1
    keystrokes += text.count
    field.slowType(text)
  }

  func swipeUp(_ app: XCUIApplication) {
    app.swipeUp()
    scrolls += 1
  }

  /// Fully on screen and not behind the tab bar. (`isHittable` is false for
  /// plain text inside cards even when it is plainly visible.)
  static func isOnScreen(_ query: XCUIElement, in app: XCUIApplication) -> Bool {
    let element = query.firstMatch
    guard element.exists else { return false }
    let frame = element.frame
    guard !frame.isEmpty else { return false }
    let tabBar = app.tabBars.firstMatch
    let bottom = tabBar.exists ? tabBar.frame.minY : app.windows.firstMatch.frame.maxY
    return frame.minY >= 0 && frame.maxY <= bottom
  }

  /// Scrolls until `element` is on screen, counting each scroll.
  func scrollTo(_ element: XCUIElement, in app: XCUIApplication, maxSwipes: Int = 6) {
    var swipes = 0
    while !FlowMeter.isOnScreen(element, in: app) && swipes < maxSwipes {
      swipeUp(app)
      swipes += 1
    }
  }

  func finish(note: String = "") {
    let record: [String: Any] = [
      "phase": phase,
      "flow": flow,
      "taps": taps,
      "fields": fields,
      "keystrokes": keystrokes,
      "scrolls": scrolls,
      "screens": screens.count,
      "screenNames": screens,
      "automationSeconds": Int(Date().timeIntervalSince(started).rounded()),
      "note": note,
    ]
    guard
      let dir = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"],
      let data = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
      let line = String(data: data, encoding: .utf8)
    else { return }
    let url = URL(fileURLWithPath: dir).appendingPathComponent("flows-\(phase).jsonl")
    let text = line + "\n"
    if let handle = try? FileHandle(forWritingTo: url) {
      handle.seekToEndOfFile()
      handle.write(Data(text.utf8))
      try? handle.close()
    } else {
      try? text.write(to: url, atomically: true, encoding: .utf8)
    }
  }
}
