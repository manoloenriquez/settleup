import Foundation

// Line protocol: each stdin line is {"id": "...", "request": AssistantRequest};
// each stdout line is {"id", "command"?, "usage"?, "error"?, "ms"}.
struct Line: Codable {
  let id: String
  let request: AssistantRequest
}

struct Result: Codable {
  let id: String
  let command: AssistantCommand?
  let usage: ModelUsage?
  let error: String?
  let ms: Int
}

func log(_ line: String) {
  FileHandle.standardError.write((line + "\n").data(using: .utf8)!)
}

@main struct Main {
  static func main() async throws {
    let env = ProcessInfo.processInfo.environment
    if let variant = env["ASSISTANT_VARIANT"].flatMap(AssistantIntelligence.Variant.init(rawValue:)) { AssistantIntelligence.variant = variant }
    if env["ASSISTANT_FEWSHOT"] == "1" { AssistantIntelligence.fewShot = true }
    if let minimal = env["ASSISTANT_MINIMAL"] { AssistantIntelligence.minimal = minimal != "0" }
    log("variant: \(AssistantIntelligence.variant.rawValue) fewShot=\(AssistantIntelligence.fewShot) minimal=\(AssistantIntelligence.minimal)")
    let report = ModelAvailability.report()
    log("model: \(report.status.rawValue) context=\(report.contextSize ?? 0) tools=\(report.supportsToolCalling)")
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    while let raw = readLine() {
      guard let data = raw.data(using: .utf8), let line = try? JSONDecoder().decode(Line.self, from: data) else {
        print(#"{"id":"?","error":"bad input line","ms":0}"#)
        fflush(stdout)
        continue
      }
      let started = Date()
      var result: Result
      do {
        let response = try await AssistantIntelligence.interpret(line.request)
        result = Result(id: line.id, command: response.command, usage: response.usage, error: nil, ms: Int(Date().timeIntervalSince(started) * 1000))
      } catch {
        let mapped = IntelligenceError.map(error)
        result = Result(id: line.id, command: nil, usage: nil, error: "\(mapped.code.rawValue): \(mapped.message)", ms: Int(Date().timeIntervalSince(started) * 1000))
      }
      print(String(data: try encoder.encode(result), encoding: .utf8)!)
      fflush(stdout)
    }
  }
}
