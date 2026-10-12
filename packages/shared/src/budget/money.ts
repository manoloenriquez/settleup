import { currencyPrecision, type CurrencyCode } from "../utils/currency";

// ---------------------------------------------------------------------------
// Integer money helpers for the budget engine. Amounts are minor units
// (centavos, yen, fils). Nothing here uses floating-point division on money.
// ---------------------------------------------------------------------------

/** Largest amount the budget accepts anywhere, in minor units. */
export const MAX_BUDGET_MINOR = 99_999_999_999;

export function addMinor(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new RangeError("Budget total exceeds supported precision");
  return sum;
}

export function sumMinor(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total = addMinor(total, value);
  return total;
}

/** floor(a × b / c) for non-negative safe integers, exact (BigInt). */
export function mulDivFloor(a: number, b: number, c: number): number {
  if (c <= 0) throw new RangeError("Divisor must be positive");
  return Number((BigInt(a) * BigInt(b)) / BigInt(c));
}

/** ceil(a / b) for non-negative integers. */
export function ceilDiv(a: number, b: number): number {
  if (b <= 0) throw new RangeError("Divisor must be positive");
  return Math.floor((a + b - 1) / b);
}

/**
 * Split `total` into parts proportional to `weights` (non-negative integers,
 * at least one positive) with the largest-remainder method: the parts are
 * integers and always add up to exactly `total`. Ties go to the earlier index.
 */
export function allocateByWeights(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError("Total must be a non-negative integer");
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) throw new RangeError("At least one weight must be positive");
  const exact = weights.map((w) => BigInt(total) * BigInt(w));
  const denom = BigInt(weightSum);
  const parts = exact.map((x) => Number(x / denom));
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, index) => ({ index, remainder: x % denom }))
    .sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  for (const { index } of order) {
    if (left <= 0) break;
    parts[index] = (parts[index] ?? 0) + 1;
    left -= 1;
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Exchange rates. A rate is a decimal string: how many units of the budget
// currency one unit of the other currency is worth ("56.25"). It is parsed to
// an integer scaled by 10^8 so conversion is exact integer arithmetic.
// ---------------------------------------------------------------------------

export const RATE_SCALE_DIGITS = 8;
const RATE_SCALE = BigInt(10) ** BigInt(RATE_SCALE_DIGITS);
export const RATE_PATTERN = /^\d{1,12}(?:\.\d{1,8})?$/;

/** The rate × 10^8 as a BigInt, or null when it is not a positive decimal with ≤ 8 places. */
export function parseRate(rate: string): bigint | null {
  if (!RATE_PATTERN.test(rate)) return null;
  const [whole, fraction = ""] = rate.split(".");
  const scaled = BigInt(whole ?? "0") * RATE_SCALE + BigInt(fraction.padEnd(RATE_SCALE_DIGITS, "0"));
  return scaled > BigInt(0) ? scaled : null;
}

/** Round n/d to the nearest integer, ties to even. d > 0. */
function divRoundHalfEven(n: bigint, d: bigint): bigint {
  const zero = BigInt(0);
  const negative = n < zero;
  const abs = negative ? -n : n;
  let q = abs / d;
  const r = abs % d;
  const twice = r * BigInt(2);
  if (twice > d || (twice === d && q % BigInt(2) === BigInt(1))) q += BigInt(1);
  return negative ? -q : q;
}

/**
 * Convert `amountMinor` of `from` into minor units of `to` at `rate` (units of
 * `to` per unit of `from`). Handles any pair of minor-unit precisions (0, 2,
 * 3 decimals). Returns null when the result is outside the safe range.
 */
export function convertMinor(
  amountMinor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rate: string,
): number | null {
  const scaled = parseRate(rate);
  if (scaled === null || !Number.isSafeInteger(amountMinor)) return null;
  const exponent = currencyPrecision(to) - currencyPrecision(from);
  const ten = BigInt(10);
  let numerator = BigInt(amountMinor) * scaled;
  let denominator = RATE_SCALE;
  if (exponent >= 0) numerator *= ten ** BigInt(exponent);
  else denominator *= ten ** BigInt(-exponent);
  const result = divRoundHalfEven(numerator, denominator);
  const asNumber = Number(result);
  return Number.isSafeInteger(asNumber) && Math.abs(asNumber) <= MAX_BUDGET_MINOR ? asNumber : null;
}

/** Round an amount down to a friendly step (₱13,548.00 → ₱13,500.00). */
export function roundDownFriendly(amountMinor: number, currency: CurrencyCode): number {
  const unit = 10 ** currencyPrecision(currency);
  const major = Math.floor(amountMinor / unit);
  const step = major >= 10_000 ? 500 : major >= 1_000 ? 100 : major >= 100 ? 10 : 1;
  return Math.max(0, Math.floor(major / step) * step * unit);
}
