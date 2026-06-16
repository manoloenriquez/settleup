/**
 * Run Tesseract.js OCR on a buffer. Returns raw text or null on failure.
 * Dynamically imports tesseract.js so the dependency only loads when used.
 */
export async function extractTextWithOCR(buffer: Buffer): Promise<string | null> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      const { data: { text } } = await worker.recognize(buffer);
      return text.trim() || null;
    } finally {
      await worker.terminate();
    }
  } catch {
    return null;
  }
}
