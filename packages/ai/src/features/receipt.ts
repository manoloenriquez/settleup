import type { ApiResponse } from "@template/shared/types";
import type { ParsedReceipt } from "@template/shared/types";
import { parseReceiptWithRegex } from "@template/shared";

/**
 * Server-side receipt parsing for the web app: HEIC conversion → Tesseract OCR
 * → regex heuristics. Deterministic and self-hosted; no third-party AI
 * provider is involved. The iPhone app does not use this path — it reads
 * receipts on the device with Apple Intelligence.
 */
export async function parseReceiptImage(
  buffer: Buffer,
  mimeType: string,
): Promise<ApiResponse<ParsedReceipt>> {
  // Tesseract does not support HEIC.
  if (mimeType === "image/heic" || mimeType === "image/heif") {
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore NodeNext build requires explicit .js extensions, but Next resolves source modules without them
      const { convertHeicToJpeg } = await import("../node/heic");
      const converted = await convertHeicToJpeg(buffer);
      buffer = converted.buffer;
    } catch {
      return { data: null, error: "Failed to convert HEIC image" };
    }
  }

  const rawText = await extractTextWithOCR(buffer);
  if (rawText) {
    return { data: parseReceiptWithRegex(rawText), error: null };
  }

  return { data: null, error: "Could not extract text from image" };
}

async function extractTextWithOCR(buffer: Buffer): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore NodeNext build requires explicit .js extensions, but Next resolves source modules without them
  const { extractTextWithOCR: run } = await import("../node/ocr");
  return run(buffer);
}
