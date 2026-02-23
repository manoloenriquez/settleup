/**
 * Format integer cents as a Philippine Peso string.
 * e.g. 123456 → "₱1,234.56", -123456 → "-₱1,234.56"
 */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const amount = Math.abs(cents) / 100;
  const formatted =
    "₱" +
    amount.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return negative ? `-${formatted}` : formatted;
}

/**
 * Parse a user-entered PHP amount string into integer cents.
 * Strips leading ₱, commas, and whitespace.
 * Returns null if the input is not a valid non-zero number.
 *
 * e.g. "₱1,234.56"  → 123456
 * e.g. "8703.39"     → 870339
 * e.g. "-8703.39"    → -870339
 * e.g. "abc"         → null
 * e.g. "0"           → null
 */
export function parsePHPAmount(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, "");
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed) || parsed === 0) return null;
  return Math.round(parsed * 100);
}
