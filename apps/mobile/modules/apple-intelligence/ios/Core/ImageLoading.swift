import Foundation
import CoreGraphics
import ImageIO

public enum ReceiptImage {
  /// Decodes a photo (JPEG, PNG, HEIC, …) with its EXIF orientation applied and
  /// the longest side capped. Receipt text stays legible at 2048 px and OCR is
  /// noticeably faster than on 12 MP originals.
  public static func load(url: URL, maxDimension: Int = 2048) throws -> CGImage {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
      throw IntelligenceError(.unreadableImage, "Cannot open image at \(url.lastPathComponent)")
    }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maxDimension,
      kCGImageSourceShouldCache: false,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
      throw IntelligenceError(.unreadableImage, "Cannot decode image at \(url.lastPathComponent)")
    }
    return image
  }
}
