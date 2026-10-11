import { z } from "zod";
import {
  currencyCodeSchema,
  currencyPrecision,
  formatAmount,
  isCurrencyCode,
  minorToDecimal,
  type CurrencyCode,
} from "@template/shared";

// ---------------------------------------------------------------------------
// Per-currency ledger helpers shared by server and browser code.
//
// A group has a default currency but may hold expenses and payments in
// others. Balances are always per currency and never converted, so callers
// first ask which currencies exist, then call the *_v2 RPCs once for each.
// ---------------------------------------------------------------------------

const codesSchema = z.array(currencyCodeSchema);

/** Validates an RPC's currency list; falls back when it is empty or malformed. */
export function parseCurrencyCodes(data: unknown, fallback: CurrencyCode[]): CurrencyCode[] {
  const parsed = codesSchema.safeParse(data);
  return parsed.success && parsed.data.length > 0 ? parsed.data : fallback;
}

/** The default currency first, then the others in their given order. */
export function defaultFirst(codes: CurrencyCode[], defaultCurrency: CurrencyCode): CurrencyCode[] {
  return [defaultCurrency, ...codes.filter((code) => code !== defaultCurrency)];
}

/** A stored currency value, or PHP for rows from before currencies existed. */
export function currencyOrPhp(value: unknown): CurrencyCode {
  return isCurrencyCode(value) ? value : "PHP";
}

/** Shown wherever more than one currency appears side by side. */
export const SEPARATE_CURRENCIES_NOTE = "Balances in each currency are separate and never converted.";

/**
 * Fixed display locale so server-rendered and browser-rendered amounts match
 * (no hydration drift) and grouping stays as before ("₱1,234.56").
 */
export const MONEY_LOCALE = "en-PH";

/**
 * formatAmount in the app's display locale. Rounds first: computed values
 * (averages, percentages of a total) may be fractional minor units, which
 * formatAmount rejects.
 */
export function formatCurrency(amountMinor: number, currency: CurrencyCode): string {
  return formatAmount(Math.round(amountMinor), currency, MONEY_LOCALE);
}

/**
 * AI drafts and receipt parses report amounts in hundredths of the major unit
 * ("cents") whatever the currency. Turns one into the text an amount input
 * shows for `currency`, dropping zero decimals the currency does not have
 * (JPY "1000.00" -> "1000"). Real extra decimals are kept so the amount
 * field's validation flags them instead of silently rounding.
 */
export function hundredthsToInput(hundredths: number, currency: CurrencyCode): string {
  const decimal = minorToDecimal(Math.round(hundredths), "PHP");
  const [whole = "0", fraction = ""] = decimal.split(".");
  const significant = fraction.replace(/0+$/, "");
  const precision = currencyPrecision(currency);
  if (significant.length > precision) return decimal;
  return precision === 0 ? whole : `${whole}.${significant.padEnd(precision, "0")}`;
}

/**
 * Totals kept per currency and listed side by side ("₱1,200.00 · $35.00"),
 * never added across currencies. Currencies appear in first-seen order.
 */
export function formatTotalsByCurrency(
  rows: { amount_cents: number; currency_code?: string | null }[],
): string {
  const totals = new Map<CurrencyCode, number>();
  for (const row of rows) {
    const currency = currencyOrPhp(row.currency_code);
    totals.set(currency, (totals.get(currency) ?? 0) + row.amount_cents);
  }
  return [...totals].map(([currency, total]) => formatCurrency(total, currency)).join(" · ");
}
