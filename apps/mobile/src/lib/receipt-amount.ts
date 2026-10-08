import { parseAmountInput } from "@template/shared";

/**
 * Receipt lines are two-decimal cents whatever the expense currency, so the
 * review screen parses them as a two-decimal amount.
 *
 * The field keeps what the person typed and only reformats when they leave
 * it: reformatting on every keystroke ("2" → "2.00") made the next digit an
 * invalid "2.004" and cleared the field.
 */
export function receiptCentsFromText(text: string): number | null {
  if (text.trim() === "") return 0;
  return parseAmountInput(text, "USD");
}

export function receiptTextFromCents(cents: number): string {
  return cents > 0 ? (cents / 100).toFixed(2) : "";
}
