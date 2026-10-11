import ExpoModulesCore
import Foundation

/// Expo bridge for the on-device intelligence core in `Core/`. Every function
/// takes and returns JSON strings: the payloads are validated with Zod in
/// `apps/mobile/src/lib/ai/apple-intelligence.ts`, so nothing here needs the
/// dynamic dictionary conversion. Failures are returned as `{ ok: false }`
/// envelopes rather than thrown, so the JavaScript side never sees an opaque
/// native exception. Nothing in this module touches the network.
public class AppleIntelligenceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleIntelligence")

    AsyncFunction("getAvailability") { () -> String in
      Envelope.ok(ModelAvailability.report())
    }

    AsyncFunction("analyzeReceipt") { (uri: URL) async -> String in
      await Envelope.run { try await ReceiptAnalyzer.analyze(imageURL: uri) }
    }

    AsyncFunction("interpretExpense") { (json: String) async -> String in
      await Envelope.run {
        try await ExpenseIntelligence.interpretExpense(try Envelope.decode(ExpenseRequest.self, from: json))
      }
    }

    AsyncFunction("interpretSplit") { (json: String) async -> String in
      await Envelope.run {
        try await ExpenseIntelligence.interpretSplit(try Envelope.decode(SplitRequest.self, from: json))
      }
    }

    AsyncFunction("interpretAssistant") { (json: String) async -> String in
      await Envelope.run {
        try await AssistantIntelligence.interpret(try Envelope.decode(AssistantRequest.self, from: json))
      }
    }

    AsyncFunction("summarizeInsights") { (json: String) async -> String in
      await Envelope.run {
        try await ExpenseIntelligence.summarizeInsights(try Envelope.decode(InsightsRequest.self, from: json))
      }
    }
  }
}

enum Envelope {
  struct Failure: Codable {
    let ok: Bool
    let code: String
    let message: String
  }

  static func run<T: Codable>(_ body: () async throws -> T) async -> String {
    do {
      return ok(try await body())
    } catch {
      let mapped = IntelligenceError.map(error)
      return encode(Failure(ok: false, code: mapped.code.rawValue, message: mapped.message))
    }
  }

  struct Success<V: Codable>: Codable {
    let ok: Bool
    let data: V
  }

  static func ok<T: Codable>(_ value: T) -> String {
    encode(Success(ok: true, data: value))
  }

  static func decode<T: Decodable>(_ type: T.Type, from json: String) throws -> T {
    guard let data = json.data(using: .utf8) else { throw IntelligenceError(.badInput, "Request is not UTF-8") }
    do {
      return try JSONDecoder().decode(type, from: data)
    } catch {
      throw IntelligenceError(.badInput, "Request could not be decoded: \(error.localizedDescription)")
    }
  }

  static func encode<T: Encodable>(_ value: T) -> String {
    let encoder = JSONEncoder()
    guard let data = try? encoder.encode(value), let string = String(data: data, encoding: .utf8) else {
      return #"{"ok":false,"code":"failed","message":"Result could not be encoded"}"#
    }
    return string
  }
}
