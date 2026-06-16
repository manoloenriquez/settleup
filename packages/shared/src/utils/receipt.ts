import type { ParsedReceipt } from "../types/ai";

/**
 * Regex-based heuristic receipt parser — no LLM required.
 * Used as fallback on web when LLM is disabled, and as primary fallback on mobile.
 */
export function parseReceiptWithRegex(text: string): ParsedReceipt {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const totalCents = extractTotal(lines);
  const lineItems = extractLineItems(lines, totalCents);
  const merchant = extractMerchant(lines);
  const date = extractDate(lines);

  const itemSum = lineItems.reduce((s, i) => s + i.total_cents, 0);
  const finalTotal = totalCents || itemSum;

  let confidence = 0.15;
  if (finalTotal > 0 && lineItems.length >= 2) confidence = 0.5;
  else if (finalTotal > 0) confidence = 0.35;
  else if (lineItems.length > 0) confidence = 0.3;

  return {
    merchant,
    date,
    line_items: lineItems,
    subtotal_cents: null,
    tax_cents: null,
    total_cents: finalTotal,
    raw_text: text,
    confidence,
  };
}

// -- Total extraction --

const SKIP_TOTAL_LINE = /\b(change|cash|tender|paid|card|payment|received|given)\b/i;

type TotalMatch = { cents: number; priority: number };

/** Priority: grand total (3) > total due / balance due / amount due (2) > total (1) */
const TOTAL_PATTERNS: { pattern: RegExp; priority: number }[] = [
  { pattern: /grand\s*total[:\s]*[₱P]?\s*([\d,]+\.?\d*)/i, priority: 3 },
  { pattern: /total\s*due[:\s]*[₱P]?\s*([\d,]+\.?\d*)/i, priority: 2 },
  { pattern: /balance\s*due[:\s]*[₱P]?\s*([\d,]+\.?\d*)/i, priority: 2 },
  { pattern: /amount\s*due[:\s]*[₱P]?\s*([\d,]+\.?\d*)/i, priority: 2 },
  { pattern: /total\s*amount[:\s]*[₱P]?\s*([\d,]+\.?\d*)/i, priority: 2 },
  { pattern: /net\s*amount[:\s]*[₱P]?\s*([\d,]+\.?\d*)/i, priority: 2 },
  { pattern: /(?:^|\s)total[:\s]*[₱P]?\s*([\d,]+\.?\d*)/i, priority: 1 },
];

function extractTotal(lines: string[]): number {
  let best: TotalMatch | null = null;

  for (const line of lines) {
    if (SKIP_TOTAL_LINE.test(line)) continue;

    for (const { pattern, priority } of TOTAL_PATTERNS) {
      const match = pattern.exec(line);
      if (match?.[1]) {
        const cents = Math.round(parseFloat(match[1].replace(/,/g, "")) * 100);
        if (cents > 0 && (!best || priority > best.priority || (priority === best.priority && cents > best.cents))) {
          best = { cents, priority };
        }
      }
    }
  }

  return best?.cents ?? 0;
}

// -- Line item extraction --

const NON_ITEM_KEYWORDS = /\b(vat|evat|sc\s*disc|pwd\s*disc|subtotal|sub\s*total|total|tin|service\s*charge|discount|promo|change|cash|card|payment|senior|zero.rated|vatable|exempt)\b/i;

const ITEM_PATTERNS = [
  // "description  ₱123.45" or "description  123.45"
  /^(.+?)\s+[₱P]?\s*([\d,]+\.?\d{0,2})\s*$/,
  // "2 x Description  123.45"
  /^(\d+)\s*[xX×]\s*(.+?)\s+[₱P]?\s*([\d,]+\.?\d{0,2})\s*$/,
];

function extractLineItems(lines: string[], totalCents: number): ParsedReceipt["line_items"] {
  const items: ParsedReceipt["line_items"] = [];

  for (const line of lines) {
    if (NON_ITEM_KEYWORDS.test(line)) continue;

    // Try qty x description format first
    const qtyMatch = ITEM_PATTERNS[1]!.exec(line);
    if (qtyMatch?.[2] && qtyMatch[3]) {
      const qty = parseInt(qtyMatch[1]!, 10);
      const cents = Math.round(parseFloat(qtyMatch[3].replace(/,/g, "")) * 100);
      if (cents > 0 && (!totalCents || cents < totalCents)) {
        items.push({
          description: qtyMatch[2].trim(),
          quantity: qty,
          unit_price_cents: Math.round(cents / qty),
          total_cents: cents,
        });
        continue;
      }
    }

    // Standard "description  price" format
    const stdMatch = ITEM_PATTERNS[0]!.exec(line);
    if (stdMatch?.[1] && stdMatch[2]) {
      const cents = Math.round(parseFloat(stdMatch[2].replace(/,/g, "")) * 100);
      // Accept items when total is unknown (totalCents === 0) or when less than total
      if (cents > 0 && (!totalCents || cents <= totalCents)) {
        items.push({
          description: stdMatch[1].trim(),
          quantity: 1,
          unit_price_cents: cents,
          total_cents: cents,
        });
      }
    }
  }

  return items;
}

// -- Merchant extraction --

const SKIP_MERCHANT = /^(official\s*receipt|sales\s*invoice|bir|tin[:\s]|\d{3}-\d{3}-\d{3}|accredited|print\s*bill)/i;

function extractMerchant(lines: string[]): string | null {
  for (const line of lines) {
    if (SKIP_MERCHANT.test(line)) continue;
    // Skip lines that are just dates or numbers
    if (/^\d{1,2}[/\-.]?\d{1,2}[/\-.]?\d{2,4}\s*$/.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    // First line that looks like a name
    if (line.length >= 2) return line;
  }
  return lines[0] ?? null;
}

// -- Date extraction --

function extractDate(lines: string[]): string | null {
  // ISO date: 2025-03-01
  const isoPattern = /(\d{4})-(\d{2})-(\d{2})/;
  // Slash/dot/dash: MM/DD/YYYY or DD/MM/YYYY
  const slashPattern = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/;

  for (const line of lines) {
    const isoMatch = isoPattern.exec(line);
    if (isoMatch?.[1] && isoMatch[2] && isoMatch[3]) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    const match = slashPattern.exec(line);
    if (match?.[1] && match[2] && match[3]) {
      const a = parseInt(match[1], 10);
      const b = parseInt(match[2], 10);
      const rawYear = match[3];
      const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;

      // Heuristic: if first number > 12, it must be a day (DD/MM/YYYY)
      let month: string;
      let day: string;
      if (a > 12) {
        day = String(a).padStart(2, "0");
        month = String(b).padStart(2, "0");
      } else {
        // Default: MM/DD/YYYY (common in Philippine receipts)
        month = String(a).padStart(2, "0");
        day = String(b).padStart(2, "0");
      }

      return `${year}-${month}-${day}`;
    }
  }

  return null;
}
