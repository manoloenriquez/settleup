import Foundation
import FoundationModels

/// Snapshot of `SystemLanguageModel` availability, evaluated live on every call
/// (Apple Intelligence can be toggled off or its assets evicted at any time).
public struct AvailabilityReport: Codable {
  public enum Status: String, Codable {
    case available
    case deviceNotEligible
    case appleIntelligenceNotEnabled
    case modelNotReady
    case unavailable
  }

  public let status: Status
  public let contextSize: Int?
  public let supportsVision: Bool
  public let supportsGuidedGeneration: Bool
  public let supportsToolCalling: Bool
}

public enum ModelAvailability {
  public static func report() -> AvailabilityReport {
    let model = SystemLanguageModel.default
    let status: AvailabilityReport.Status
    switch model.availability {
    case .available:
      status = .available
    case .unavailable(let reason):
      switch reason {
      case .deviceNotEligible: status = .deviceNotEligible
      case .appleIntelligenceNotEnabled: status = .appleIntelligenceNotEnabled
      case .modelNotReady: status = .modelNotReady
      @unknown default: status = .unavailable
      }
    }
    let capabilities = model.capabilities
    return AvailabilityReport(
      status: status,
      contextSize: status == .available ? model.contextSize : nil,
      supportsVision: capabilities.contains(.vision),
      supportsGuidedGeneration: capabilities.contains(.guidedGeneration),
      supportsToolCalling: capabilities.contains(.toolCalling)
    )
  }

  /// Throws the typed error every feature uses when the model cannot run.
  public static func requireAvailable() throws -> SystemLanguageModel {
    let model = SystemLanguageModel.default
    guard case .available = model.availability else {
      throw IntelligenceError(.unavailable, "Apple Intelligence is not available: \(report().status.rawValue)")
    }
    return model
  }
}
