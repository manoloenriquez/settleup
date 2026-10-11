import Foundation
import Vision
import CoreGraphics
import ImageIO

public struct OCRLine {
  public let text: String
  public let minX: Double
  public let maxX: Double
  public let centerX: Double
  public let centerY: Double
  public let height: Double
  /// Baseline slope (dy/dx) of this observation, or NaN when it is too narrow to measure.
  public let slope: Double

  public init(text: String, minX: Double, maxX: Double, centerX: Double, centerY: Double, height: Double, slope: Double) {
    self.text = text
    self.minX = minX
    self.maxX = maxX
    self.centerX = centerX
    self.centerY = centerY
    self.height = height
    self.slope = slope
  }
}

public struct OCRResult {
  /// One receipt row per entry, columns joined with two spaces, top to bottom.
  public let rows: [String]
  public let lineCount: Int
  public var rowText: String { rows.joined(separator: "\n") }
}

public enum ReceiptOCR {
  /// Vision document OCR. Language correction is off on purpose: it "fixes"
  /// prices and item codes into words. Barcodes are irrelevant to the ledger.
  public static func recognize(_ image: CGImage, orientation: CGImagePropertyOrientation = .up) async throws -> OCRResult {
    var request = RecognizeDocumentsRequest()
    request.textRecognitionOptions.useLanguageCorrection = false
    request.barcodeDetectionOptions.enabled = false
    let observations = try await request.perform(on: image, orientation: orientation)
    guard let document = observations.first?.document else {
      return OCRResult(rows: [], lineCount: 0)
    }
    let lines: [OCRLine] = document.text.lines.compactMap { obs in
      guard let candidate = obs.topCandidates(1).first else { return nil }
      let box = obs.boundingBox.cgRect
      let dx = obs.topRight.x - obs.topLeft.x
      let slope = dx > 0.05 ? (obs.topRight.y - obs.topLeft.y) / dx : Double.nan
      return OCRLine(text: candidate.string, minX: box.minX, maxX: box.maxX, centerX: box.midX, centerY: box.midY, height: box.height, slope: slope)
    }
    let rows = ReceiptRows.pairColumns(ReceiptRows.reconstruct(lines))
    return OCRResult(rows: rows, lineCount: lines.count)
  }
}

/// Deterministic layout reconstruction for receipt OCR. Vision returns each
/// printed word-run as its own observation, so "Coke Zero .... 125.00" arrives as
/// two boxes; this rebuilds rows and re-pairs item names with prices when the two
/// columns are vertically offset or wrapped onto the next line.
public enum ReceiptRows {
  public static func reconstruct(_ lines: [OCRLine]) -> [String] {
    guard !lines.isEmpty else { return [] }
    // Photos are rarely square-on: remove the median baseline slope before grouping
    // so a row that climbs across the receipt is still one row.
    let slopes = lines.map(\.slope).filter { !$0.isNaN }.sorted()
    let skew = slopes.isEmpty ? 0 : slopes[slopes.count / 2]
    let adjusted = lines.map { ($0, $0.centerY - skew * $0.centerX) }
    let heights = lines.map(\.height).sorted()
    let medianHeight = heights[heights.count / 2]
    let tolerance = max(medianHeight * 0.55, 0.004)
    // Vision's normalized coordinates grow upward; sort top-first.
    let sorted = adjusted.sorted { $0.1 > $1.1 }
    var groups: [[(OCRLine, Double)]] = []
    for item in sorted {
      if let last = groups.last {
        let meanY = last.map(\.1).reduce(0, +) / Double(last.count)
        if abs(meanY - item.1) <= tolerance {
          groups[groups.count - 1].append(item)
          continue
        }
      }
      groups.append([item])
    }
    return groups.map { group in
      group.sorted { $0.0.minX < $1.0.minX }.map(\.0.text).joined(separator: "  ")
    }
  }

  static let amountPattern = try! NSRegularExpression(pattern: #"(?<![\d:/-])\(?(?:\d{1,3}(?:[,.]\d{3})+|\d+)[.:]\d{2}\)?(?![\d%])"#)
  static let blockEndPattern = try! NSRegularExpression(pattern: #"(?i)\b(sub\s*total|gross\s*sales|total|amount\s*due|balance|vat|service|discount|promo|disc|cash|change|tender|net)\b"#)
  static let blockStartPattern = try! NSRegularExpression(pattern: #"(?i)\b(description|qty|quantity|u\.?cost|price|amount|item)\b"#)
  static let metadataPattern = try! NSRegularExpression(pattern: #"(?i)\b(date|time|table|slip|staff|server|guest|register|cashier|order|reprint|tin|invoice|receipt|bill|no\.)\b|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}:\d{2}"#)

  static func amounts(in row: String) -> [String] {
    let range = NSRange(row.startIndex..., in: row)
    return amountPattern.matches(in: row, range: range).compactMap { Range($0.range, in: row).map { String(row[$0]) } }
  }

  static func matches(_ regex: NSRegularExpression, _ row: String) -> Bool {
    regex.firstMatch(in: row, range: NSRange(row.startIndex..., in: row)) != nil
  }

  static func stripAmounts(_ row: String) -> String {
    let range = NSRange(row.startIndex..., in: row)
    return amountPattern.stringByReplacingMatches(in: row, range: range, withTemplate: "")
      .replacingOccurrences(of: "  ", with: " ")
      .trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
  }

  /// Within the item block (after the column header or first priced row, before the
  /// first totals keyword), thermal printers often print the price column half a line
  /// above or below the item name, or wrap the amounts onto the next line. Row grouping
  /// then yields name-only and amount-only rows. When the block has the same number of
  /// names and amount groups, pairing them in printed order recovers the table;
  /// otherwise the rows are left untouched.
  public static func pairColumns(_ rows: [String]) -> [String] {
    guard let end = rows.firstIndex(where: { row in
      matches(blockEndPattern, row) && !amounts(in: row).isEmpty && !matches(blockStartPattern, row)
    }) else { return rows }
    var start = 0
    if let header = rows[..<end].lastIndex(where: { matches(blockStartPattern, $0) && amounts(in: $0).isEmpty }) {
      start = header + 1
    } else if let firstPriced = rows[..<end].firstIndex(where: { !amounts(in: $0).isEmpty && !matches(metadataPattern, $0) }) {
      start = firstPriced
    } else {
      return rows
    }
    guard start < end else { return rows }
    let block = Array(rows[start..<end])
    var names: [String] = []
    var amountGroups: [[String]] = []
    var alreadyPaired = true
    for row in block {
      let rowAmounts = amounts(in: row)
      let name = stripAmounts(row)
      let hasName = name.range(of: "[A-Za-z]{2,}", options: .regularExpression) != nil
      if hasName { names.append(name) }
      if !rowAmounts.isEmpty { amountGroups.append(rowAmounts) }
      if hasName != !rowAmounts.isEmpty { alreadyPaired = false }
    }
    guard !alreadyPaired, names.count == amountGroups.count, !names.isEmpty else { return rows }
    let paired = zip(names, amountGroups).map { "\($0)  \($1.joined(separator: "  "))" }
    return Array(rows[..<start]) + paired + Array(rows[end...])
  }
}
