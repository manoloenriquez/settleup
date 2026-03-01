import type { ApiResponse } from "@template/shared/types";
import type { ParsedReceipt } from "@template/shared/types";
import { parsedReceiptSchema } from "@template/shared/schemas";
import { generateJSON, isLLMEnabled } from "./index";

/**
 * Run OCR on an image buffer, then optionally pass through LLM for structured extraction.
 * Falls back to regex heuristics when LLM is disabled.
 */
export async function parseReceiptImage(
  buffer: Buffer,
  userId: string,
): Promise<ApiResponse<ParsedReceipt>> {
  // Dynamic import — tesseract.js is heavy, only load when needed
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  let rawText: string;
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    rawText = text;
  } finally {
    await worker.terminate();
  }

  if (!rawText.trim()) {
    return { data: null, error: "Could not extract text from image" };
  }

  if (isLLMEnabled()) {
    return generateJSON<ParsedReceipt>({
      system: `You are a receipt parser. Extract structured data from OCR text of a receipt.
Return JSON matching this schema:
- merchant: string | null (store/restaurant name)
- date: string | null (ISO date like "2025-03-01")
- line_items: array of {description, quantity, unit_price_cents, total_cents}
- subtotal_cents: number | null
- tax_cents: number | null
- total_cents: number (REQUIRED — the grand total in integer cents, e.g. 12345 for ₱123.45)
- raw_text: the original OCR text
- confidence: 0-1 how confident you are in the extraction

All monetary values must be integer cents (multiply pesos by 100).
If you can't determine a value, use null. Always provide total_cents as your best estimate.`,
      prompt: rawText,
      schema: parsedReceiptSchema,
      userId,
    });
  }

  // Fallback: regex heuristic parsing
  return { data: parseReceiptWithRegex(rawText), error: null };
}

function parseReceiptWithRegex(text: string): ParsedReceipt {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Try to find total
  let totalCents = 0;
  const totalPattern = /(?:total|grand\s*total|amount\s*due|balance)[:\s]*[₱P]?\s*([\d,]+\.?\d*)/i;
  for (const line of lines) {
    const match = totalPattern.exec(line);
    if (match?.[1]) {
      totalCents = Math.round(parseFloat(match[1].replace(/,/g, "")) * 100);
    }
  }

  // Try to find line items (pattern: description followed by price)
  const lineItems: ParsedReceipt["line_items"] = [];
  const itemPattern = /^(.+?)\s+[₱P]?\s*([\d,]+\.?\d{0,2})\s*$/;
  for (const line of lines) {
    const match = itemPattern.exec(line);
    if (match?.[1] && match[2]) {
      const cents = Math.round(parseFloat(match[2].replace(/,/g, "")) * 100);
      if (cents > 0 && cents < totalCents) {
        lineItems.push({
          description: match[1].trim(),
          quantity: 1,
          unit_price_cents: cents,
          total_cents: cents,
        });
      }
    }
  }

  // Try to find merchant (usually first non-empty line)
  const merchant = lines[0] ?? null;

  // Try to find date
  let date: string | null = null;
  const datePattern = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/;
  for (const line of lines) {
    const match = datePattern.exec(line);
    if (match) {
      const year = match[3]!.length === 2 ? `20${match[3]}` : match[3];
      date = `${year}-${match[1]!.padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
      break;
    }
  }

  return {
    merchant,
    date,
    line_items: lineItems,
    subtotal_cents: null,
    tax_cents: null,
    total_cents: totalCents || (lineItems.reduce((s, i) => s + i.total_cents, 0)),
    raw_text: text,
    confidence: totalCents > 0 ? 0.4 : 0.2,
  };
}
