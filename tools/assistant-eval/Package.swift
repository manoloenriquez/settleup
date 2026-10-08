// swift-tools-version: 6.0
import PackageDescription

// macOS 27 harness that runs the exact Swift core the iOS module ships
// (symlinked from apps/mobile/modules/apple-intelligence/ios/Core) on the
// Mac's copy of the on-device system model. It speaks one JSON request per
// line on stdin and answers one JSON line on stdout, so eval.ts can run
// multi-turn conversations through the real resolver between turns.
let package = Package(
  name: "assistant-eval",
  platforms: [.macOS("27.0")],
  targets: [
    .executableTarget(
      name: "assistant-eval",
      path: "Sources/assistant-eval",
      swiftSettings: [.swiftLanguageMode(.v5)]
    ),
  ]
)
