import Foundation

// Usage: receipt-eval <receipts-dir> <image>...   (prints a JSON array of raw analyses)
struct Entry: Codable {
  let image: String
  let analysis: ReceiptAnalysis?
  let error: String?
  let totalMs: Int
}

func log(_ line: String) {
  FileHandle.standardError.write((line + "\n").data(using: .utf8)!)
}

@main struct Main {
  static func main() async throws {
    let args = Array(CommandLine.arguments.dropFirst())
    guard let dir = args.first else {
      log("usage: receipt-eval <receipts-dir> <image>...")
      exit(2)
    }
    let images = Array(args.dropFirst())
    let report = ModelAvailability.report()
    log("model: \(report.status.rawValue) context=\(report.contextSize ?? 0)")
    var entries: [Entry] = []
    for image in images {
      let url = URL(fileURLWithPath: dir).appendingPathComponent(image)
      let started = Date()
      do {
        let analysis = try await ReceiptAnalyzer.analyze(imageURL: url)
        entries.append(Entry(image: image, analysis: analysis, error: nil, totalMs: Int(Date().timeIntervalSince(started) * 1000)))
        log("\(image): ocr \(analysis.ocrMs)ms model \(analysis.modelMs)ms tokens \(analysis.inputTokens)/\(analysis.outputTokens)")
      } catch {
        entries.append(Entry(image: image, analysis: nil, error: "\(error)", totalMs: Int(Date().timeIntervalSince(started) * 1000)))
        log("\(image): FAILED \(error)")
      }
    }
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    print(String(data: try encoder.encode(entries), encoding: .utf8)!)
  }
}
