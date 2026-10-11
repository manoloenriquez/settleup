import Foundation
import FoundationModels

/// Typed failure surface shared by every intelligence call. The JavaScript side
/// maps `code` to user-facing copy; `message` is for logs.
public struct IntelligenceError: Error, Codable, LocalizedError {
  public enum Code: String, Codable {
    /// Apple Intelligence is not available on this device right now (see `ModelAvailability`).
    case unavailable
    /// The prompt (OCR text, history, facts) did not fit the on-device context window.
    case contextExceeded
    /// The model declined the request (safety guardrail or refusal).
    case declined
    /// The device language/locale is not supported by the model.
    case unsupportedLanguage
    /// Another generation is already running on this session.
    case busy
    /// The image could not be read or contained no legible text.
    case unreadableImage
    /// Input from JavaScript could not be decoded.
    case badInput
    /// Any other failure.
    case failed
  }

  public let code: Code
  public let message: String

  public init(_ code: Code, _ message: String) {
    self.code = code
    self.message = message
  }

  public var errorDescription: String? { message }

  /// Maps FoundationModels errors onto the small set of codes the app reasons about.
  public static func map(_ error: Error) -> IntelligenceError {
    if let known = error as? IntelligenceError { return known }
    if let generation = error as? LanguageModelSession.GenerationError {
      switch generation {
      case .exceededContextWindowSize: return IntelligenceError(.contextExceeded, "The receipt text did not fit the on-device model's context window.")
      case .assetsUnavailable: return IntelligenceError(.unavailable, "The on-device model assets are not available yet.")
      case .guardrailViolation, .refusal: return IntelligenceError(.declined, "The on-device model declined this request.")
      case .unsupportedLanguageOrLocale: return IntelligenceError(.unsupportedLanguage, "The on-device model does not support this language.")
      case .concurrentRequests, .rateLimited: return IntelligenceError(.busy, "The on-device model is busy. Try again in a moment.")
      case .decodingFailure, .unsupportedGuide: return IntelligenceError(.failed, "The on-device model returned an unexpected result.")
      @unknown default: return IntelligenceError(.failed, "\(generation)")
      }
    }
    if let model = error as? LanguageModelError {
      switch model {
      case .contextSizeExceeded: return IntelligenceError(.contextExceeded, "The request did not fit the on-device model's context window.")
      case .guardrailViolation, .refusal: return IntelligenceError(.declined, "The on-device model declined this request.")
      case .unsupportedLanguageOrLocale: return IntelligenceError(.unsupportedLanguage, "The on-device model does not support this language.")
      case .rateLimited, .timeout: return IntelligenceError(.busy, "The on-device model is busy. Try again in a moment.")
      default: return IntelligenceError(.failed, "\(model)")
      }
    }
    return IntelligenceError(.failed, error.localizedDescription)
  }
}
