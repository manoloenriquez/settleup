// swift-tools-version: 6.0
import PackageDescription

// macOS 27 command-line harness that runs the exact Swift core the iOS module
// ships (symlinked from apps/mobile/modules/apple-intelligence/ios/Core) against
// the sample receipts and prints raw extractions as JSON. Scoring happens in
// TypeScript (eval.ts) with the same reconciliation code the app uses.
let package = Package(
  name: "receipt-eval",
  platforms: [.macOS("27.0")],
  targets: [
    .executableTarget(
      name: "receipt-eval",
      path: "Sources/receipt-eval",
      swiftSettings: [.swiftLanguageMode(.v5)]
    ),
  ]
)
