import { z } from "zod";

/** Explicit supported ledger currencies. Values are ISO 4217 minor-unit exponents. */
export const CURRENCY_PRECISION = {
  PHP: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  NZD: 2,
  JPY: 0,
  CNY: 2,
  HKD: 2,
  SGD: 2,
  TWD: 2,
  KRW: 0,
  INR: 2,
  THB: 2,
  VND: 0,
  IDR: 2,
  MYR: 2,
  CHF: 2,
  NOK: 2,
  SEK: 2,
  DKK: 2,
  PLN: 2,
  CZK: 2,
  HUF: 2,
  RON: 2,
  BRL: 2,
  MXN: 2,
  ARS: 2,
  CLP: 0,
  COP: 2,
  PEN: 2,
  ZAR: 2,
  AED: 2,
  SAR: 2,
  QAR: 2,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  JOD: 3,
  EGP: 2,
  ILS: 2,
  TRY: 2,
  ISK: 0,
  PKR: 2,
  BDT: 2,
  LKR: 2,
  NPR: 2,
  KES: 2,
  NGN: 2,
  UAH: 2,
  MAD: 2,
} as const;
export type CurrencyCode = keyof typeof CURRENCY_PRECISION;
export const CURRENCY_CODES = Object.keys(CURRENCY_PRECISION) as CurrencyCode[];
export const currencyCodeSchema = z.enum(CURRENCY_CODES);
export const moneySchema = z.object({
  currency_code: currencyCodeSchema,
  amount_minor: z.number().int().safe(),
});
export type Money = z.infer<typeof moneySchema>;

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && Object.hasOwn(CURRENCY_PRECISION, value);
}

export function currencyPrecision(currency: CurrencyCode): number {
  return CURRENCY_PRECISION[currency];
}

export function minorToDecimal(amountMinor: number, currency: CurrencyCode): string {
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError("Amount must be a safe integer");
  const precision = currencyPrecision(currency);
  const digits = String(Math.abs(amountMinor)).padStart(precision + 1, "0");
  return `${amountMinor < 0 ? "-" : ""}${precision ? `${digits.slice(0, -precision)}.${digits.slice(-precision)}` : digits}`;
}

export function formatMoney(amountMinor: number, currency: CurrencyCode, locale?: string): string {
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError("Amount must be a safe integer");
  const precision = currencyPrecision(currency);
  const divisor = BigInt(10) ** BigInt(precision);
  const whole = BigInt(amountMinor) / divisor;
  const fraction = (BigInt(Math.abs(amountMinor)) % divisor).toString().padStart(precision, "0");
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  // Format the integer as BigInt so large safe amounts do not lose a minor unit
  // through floating-point division. Preserve the sign on negative fractions.
  return formatter
    .formatToParts(whole === BigInt(0) && amountMinor < 0 ? -0 : whole)
    .map((part) =>
      part.type === "fraction"
        ? new Intl.NumberFormat(locale, {
            useGrouping: false,
            minimumIntegerDigits: precision,
          }).format(Number(fraction))
        : part.value,
    )
    .join("");
}

/** Locale-aware input, with exact integer conversion and no silent rounding. */
export function parseMoneyAmount(
  input: string,
  currency: CurrencyCode,
  locale = "en-US",
): number | null {
  const parts = new Intl.NumberFormat(locale).formatToParts(123456789.6);
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? ".";
  const grouping = parts.find((part) => part.type === "group")?.value ?? ",";
  let cleaned = input.trim().replace(/\u2212/g, "-");
  // Accept local numerals without depending on parseFloat's ASCII-only behavior.
  for (let digit = 0; digit <= 9; digit++) {
    const localDigit = new Intl.NumberFormat(locale, { useGrouping: false }).format(digit);
    cleaned = cleaned.split(localDigit).join(String(digit));
  }
  cleaned = cleaned.replace(/[\u200e\u200f\u061c]/g, "");
  const integerPart = cleaned.split(decimal)[0]?.replace(/^-/, "") ?? "";
  if (integerPart.includes(grouping)) {
    const groups = integerPart.split(grouping);
    const sizes = parts.filter((part) => part.type === "integer").map((part) => part.value.length);
    const lastSize = sizes.at(-1) ?? 3;
    const otherSize = sizes.at(-2) ?? lastSize;
    if (
      groups.at(-1)?.length !== lastSize ||
      !groups[0] ||
      groups[0].length > otherSize ||
      groups.slice(1, -1).some((group) => group.length !== otherSize) ||
      groups.some((group) => !/^\d+$/.test(group))
    )
      return null;
  }
  // Grouping is legal only in the integer part, never after the decimal mark.
  if (
    cleaned
      .split(decimal)
      .slice(1)
      .some((part) => part.includes(grouping))
  )
    return null;
  cleaned = cleaned.split(grouping).join("");
  if (decimal !== ".") cleaned = cleaned.split(decimal).join(".");
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) return null;
  const precision = currencyPrecision(currency);
  const fraction = match[3] ?? "";
  if (fraction.length > precision) return null;
  const digits = `${match[2]}${fraction.padEnd(precision, "0")}`;
  const amount = Number(digits) * (match[1] ? -1 : 1);
  return Number.isSafeInteger(amount) && amount !== 0 ? amount : null;
}

/** Totals remain separate by currency; conversion is deliberately absent. */
export function sumMoney(values: Money[]): Money[] {
  const totals = new Map<CurrencyCode, number>();
  for (const value of values) {
    const parsed = moneySchema.parse(value);
    const amount = (totals.get(parsed.currency_code) ?? 0) + parsed.amount_minor;
    if (!Number.isSafeInteger(amount)) throw new RangeError("Total exceeds supported precision");
    totals.set(parsed.currency_code, amount);
  }
  return [...totals].map(([currency_code, amount_minor]) => ({ currency_code, amount_minor }));
}
