import type { ParsedReceipt } from "../types/ai";

/**
 * Regex-based heuristic receipt parser — no LLM required.
 * Used as fallback on web when LLM is disabled, and as primary fallback on mobile.
 */
export function parseReceiptWithRegex(text: string): ParsedReceipt {
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
    total_cents: totalCents || lineItems.reduce((s, i) => s + i.total_cents, 0),
    raw_text: text,
    confidence: totalCents > 0 ? 0.4 : 0.2,
  };
}
