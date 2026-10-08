import SwiftUI

/// Empty host. The UI tests drive the installed Talli app by bundle identifier.
@main
struct HostApp: App {
  var body: some Scene { WindowGroup { Text("Talli UI driver") } }
}
