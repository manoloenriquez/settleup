import Foundation
import FoundationModels
import CoreGraphics

/// Raw, unvalidated output of the on-device pipeline. Numbers are pesos as the
/// model read them; the TypeScript reconciliation turns this into a reviewed
/// expense. `ocrRows` travels with it so that reconciliation can anchor every
/// value to the printed text.
public struct ReceiptAnalysis: Codable {
  public struct Item: Codable {
    public let name: String
    public let quantity: Double?
    public let unitPrice: Double?
    public let totalPrice: Double?
  }

  public let merchant: String?
  public let date: String?
  public let currency: String?
  public let subtotal: Double?
  public let tax: Double?
  public let serviceCharge: Double?
  public let discount: Double?
  public let tip: Double?
  public let total: Double?
  public let items: [Item]
  public let ocrRows: [String]
  public let strategy: String
  public let ocrMs: Int
  public let modelMs: Int
  public let inputTokens: Int
  public let outputTokens: Int
}

public enum ReceiptAnalyzer {
  /// Keeps long receipts inside the 4k-token context: the footer after the last
  /// totals row (TIN, accreditation, marketing) carries nothing the ledger needs.
  static let maxRows = 90
  static let maxCharacters = 4500

  public static func analyze(imageURL: URL) async throws -> ReceiptAnalysis {
    let image = try ReceiptImage.load(url: imageURL)
    return try await analyze(image: image)
  }

  public static func analyze(image: CGImage) async throws -> ReceiptAnalysis {
    let model = try ModelAvailability.requireAvailable()

    let ocrStart = Date()
    let ocr: OCRResult
    do {
      ocr = try await ReceiptOCR.recognize(image)
    } catch {
      throw IntelligenceError(.unreadableImage, "Text recognition failed: \(error.localizedDescription)")
    }
    let ocrMs = Int(Date().timeIntervalSince(ocrStart) * 1000)
    let rows = trim(ocr.rows)
    guard !rows.joined().trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw IntelligenceError(.unreadableImage, "No legible text was found in the photo.")
    }

    let modelStart = Date()
    let session = LanguageModelSession(model: model, instructions: ReceiptPrompts.instructions)
    let response: LanguageModelSession.Response<ReceiptExtraction>
    do {
      response = try await session.respond(
        to: ReceiptPrompts.ocrTextPrompt + rows.joined(separator: "\n"),
        generating: ReceiptExtraction.self,
        options: GenerationOptions(samplingMode: .greedy)
      )
    } catch {
      throw IntelligenceError.map(error)
    }
    let extraction = response.content
    return ReceiptAnalysis(
      merchant: extraction.merchant,
      date: extraction.date,
      currency: extraction.currency,
      subtotal: extraction.subtotal,
      tax: extraction.tax,
      serviceCharge: extraction.serviceCharge,
      discount: extraction.discount,
      tip: extraction.tip,
      total: extraction.total,
      items: extraction.items.map { ReceiptAnalysis.Item(name: $0.name, quantity: $0.quantity, unitPrice: $0.unitPrice, totalPrice: $0.totalPrice) },
      ocrRows: ocr.rows,
      strategy: "ocr-text",
      ocrMs: ocrMs,
      modelMs: Int(Date().timeIntervalSince(modelStart) * 1000),
      inputTokens: response.usage.input.totalTokenCount,
      outputTokens: response.usage.output.totalTokenCount
    )
  }

  static func trim(_ rows: [String]) -> [String] {
    var kept: [String] = []
    var characters = 0
    for row in rows.prefix(maxRows) {
      characters += row.count + 1
      if characters > maxCharacters { break }
      kept.append(row)
    }
    return kept
  }
}
