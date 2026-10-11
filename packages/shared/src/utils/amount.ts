import { currencyPrecision, formatMoney, isCurrencyCode, type CurrencyCode } from "./currency";

// ---------------------------------------------------------------------------
// Display formatting and forgiving keypad input for any supported currency.
// Amounts are always integer minor units; the precision comes from the
// currency (JPY 0, PHP 2, KWD 3), never from an assumption about pesos.
// ---------------------------------------------------------------------------

const formatterCache = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: CurrencyCode, locale: string | undefined): Intl.NumberFormat {
  const key = `${locale ?? ""}|${currency}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const precision = currencyPrecision(currency);
  const options: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  };
  let formatter: Intl.NumberFormat;
  try {
    formatter = new Intl.NumberFormat(locale, { ...options, currencyDisplay: "narrowSymbol" });
  } catch {
    // Older Intl implementations reject narrowSymbol.
    formatter = new Intl.NumberFormat(locale, options);
  }
  formatterCache.set(key, formatter);
  return formatter;
}

/** Up to 2^53 / 1000 the float quotient still rounds to the exact minor unit. */
const FLOAT_SAFE_MINOR = 9_000_000_000_000;

/**
 * "₱1,234.56", "¥1,235", "$12.00" — symbol form for everyday display.
 * Use `formatMoney` where an unambiguous ISO code is required (exports).
 */
export function formatAmount(amountMinor: number, currency: CurrencyCode, locale?: string): string {
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError("Amount must be a safe integer");
  if (Math.abs(amountMinor) > FLOAT_SAFE_MINOR) return formatMoney(amountMinor, currency, locale);
  const value = amountMinor / 10 ** currencyPrecision(currency);
  return currencyFormatter(currency, locale).format(value);
}

/** Currency symbol on its own, for an input prefix ("₱", "$", "¥", "CHF"). */
export function currencySymbol(currency: CurrencyCode, locale?: string): string {
  // Hermes has no Intl.NumberFormat#formatToParts, so strip the digits,
  // separators and spacing from a formatted zero instead.
  const symbol = currencyFormatter(currency, locale)
    .format(0)
    .replace(/[\d.,\s\u00a0\u202f\u200e\u200f-]/g, "");
  return symbol || currency;
}

/**
 * Parse what someone typed on a decimal keypad into minor units.
 *
 * Accepts either "." or "," as the decimal mark because the iOS decimal pad
 * shows the device locale's mark. A single separator followed by exactly three
 * digits after a comma is read as thousands grouping ("1,500" → 1500) unless
 * the currency itself has three decimals; "1.500" is rejected as ambiguous. Rejects more decimals than the currency allows
 * instead of rounding, and returns null for zero, negatives and garbage.
 */
export function parseAmountInput(input: string, currency: CurrencyCode): number | null {
  const precision = currencyPrecision(currency);
  if (/[-\u2212]/.test(input)) return null;
  // Drop spacing and a currency symbol or ISO code the person typed or pasted;
  // anything else that is not a digit or separator makes the input invalid.
  const cleaned = input
    .replace(/[\s\u00a0\u202f]/g, "")
    // Explicit symbol list: Hermes' regex engine may lack \p{Sc}.
    .replace(/[$€£¥₱₩₹฿₫₪₺₴₦₽₡₲₵₸₼₾元円]/g, "")
    .replace(/^[A-Za-z]{3}|[A-Za-z]{3}$/g, "");
  if (!cleaned || !/^[\d.,]+$/.test(cleaned)) return null;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let integerPart = cleaned;
  let fraction = "";

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalIndex = Math.max(lastDot, lastComma);
    const grouping = decimalIndex === lastDot ? "," : ".";
    integerPart = cleaned.slice(0, decimalIndex);
    fraction = cleaned.slice(decimalIndex + 1);
    if (integerPart.includes(decimalIndex === lastDot ? "." : ",")) return null;
    if (!validGrouping(integerPart, grouping)) return null;
    integerPart = integerPart.split(grouping).join("");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const mark = lastDot >= 0 ? "." : ",";
    const pieces = cleaned.split(mark);
    const tail = pieces[pieces.length - 1] ?? "";
    // "1,500" is grouping; a lone "1.500" is ambiguous (1.5 or 1500) and is
    // only accepted as decimals when the currency has three of them.
    const looksGrouped = pieces.length > 2 || (mark === "," && tail.length === 3 && precision !== 3);
    if (looksGrouped) {
      if (!validGrouping(cleaned, mark)) return null;
      integerPart = pieces.join("");
    } else {
      integerPart = pieces[0] ?? "";
      fraction = tail;
    }
  }

  if (!/^\d*$/.test(integerPart) || !/^\d*$/.test(fraction)) return null;
  if (integerPart === "" && fraction === "") return null;
  if (fraction.length > precision) return null;
  const digits = `${integerPart || "0"}${fraction.padEnd(precision, "0")}`;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function validGrouping(value: string, mark: string): boolean {
  const groups = value.split(mark);
  if (groups.length === 1) return /^\d+$/.test(value);
  const [first, ...rest] = groups;
  return !!first && /^[1-9]\d{0,2}$/.test(first) && rest.every((group) => /^\d{3}$/.test(group));
}

/** Minor units → the plain decimal string an input field shows when editing. */
export function amountToInput(amountMinor: number, currency: CurrencyCode): string {
  const precision = currencyPrecision(currency);
  if (precision === 0) return String(amountMinor);
  const digits = String(amountMinor).padStart(precision + 1, "0");
  return `${digits.slice(0, -precision)}.${digits.slice(-precision)}`;
}

/**
 * Amounts large enough that a slip of the decimal point is likelier than a
 * real expense, so the UI asks once before saving. Zero-decimal currencies
 * (JPY, KRW, VND…) use a higher major-unit threshold.
 */
export function isUnusuallyLarge(amountMinor: number, currency: CurrencyCode): boolean {
  const precision = currencyPrecision(currency);
  const majorThreshold = precision === 0 ? 100_000_000 : 1_000_000;
  return amountMinor >= majorThreshold * 10 ** precision;
}

// ---------------------------------------------------------------------------
// Default currency from the device region
// ---------------------------------------------------------------------------

const REGION_CURRENCY: Record<string, CurrencyCode> = {
  PH: "PHP", US: "USD", PR: "USD", GU: "USD", EC: "USD", SV: "USD", PA: "USD",
  GB: "GBP", IE: "EUR", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR",
  AT: "EUR", PT: "EUR", FI: "EUR", GR: "EUR", LU: "EUR", SK: "EUR", SI: "EUR", EE: "EUR",
  LV: "EUR", LT: "EUR", MT: "EUR", CY: "EUR", HR: "EUR",
  JP: "JPY", KR: "KRW", SG: "SGD", AU: "AUD", NZ: "NZD", CA: "CAD", HK: "HKD", TW: "TWD",
  CN: "CNY", IN: "INR", TH: "THB", VN: "VND", ID: "IDR", MY: "MYR", CH: "CHF", LI: "CHF",
  NO: "NOK", SE: "SEK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BR: "BRL",
  MX: "MXN", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", ZA: "ZAR", AE: "AED", SA: "SAR",
  QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR", JO: "JOD", EG: "EGP", IL: "ILS", TR: "TRY",
  IS: "ISK", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR", KE: "KES", NG: "NGN", UA: "UAH",
  MA: "MAD",
};

/** Region subtag of a BCP 47 locale ("en-PH" → "PH", "zh-Hant-TW" → "TW"). */
export function regionFromLocale(locale: string | null | undefined): string | null {
  if (!locale) return null;
  const parts = locale.replace(/_/g, "-").split("-");
  for (const part of parts.slice(1)) {
    if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase();
  }
  return null;
}

/** Talli's initial default currency for a device locale; PHP when unknown. */
export function defaultCurrencyForLocale(locale: string | null | undefined): CurrencyCode {
  const region = regionFromLocale(locale);
  const code = region ? REGION_CURRENCY[region] : undefined;
  return code && isCurrencyCode(code) ? code : "PHP";
}

// ---------------------------------------------------------------------------
// Currency names (static: Intl.DisplayNames is not available on every engine)
// ---------------------------------------------------------------------------

const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  PHP: "Philippine Peso", USD: "US Dollar", EUR: "Euro", GBP: "British Pound",
  CAD: "Canadian Dollar", AUD: "Australian Dollar", NZD: "New Zealand Dollar",
  JPY: "Japanese Yen", CNY: "Chinese Yuan", HKD: "Hong Kong Dollar",
  SGD: "Singapore Dollar", TWD: "New Taiwan Dollar", KRW: "South Korean Won",
  INR: "Indian Rupee", THB: "Thai Baht", VND: "Vietnamese Dong",
  IDR: "Indonesian Rupiah", MYR: "Malaysian Ringgit", CHF: "Swiss Franc",
  NOK: "Norwegian Krone", SEK: "Swedish Krona", DKK: "Danish Krone",
  PLN: "Polish Złoty", CZK: "Czech Koruna", HUF: "Hungarian Forint",
  RON: "Romanian Leu", BRL: "Brazilian Real", MXN: "Mexican Peso",
  ARS: "Argentine Peso", CLP: "Chilean Peso", COP: "Colombian Peso",
  PEN: "Peruvian Sol", ZAR: "South African Rand", AED: "UAE Dirham",
  SAR: "Saudi Riyal", QAR: "Qatari Riyal", KWD: "Kuwaiti Dinar",
  BHD: "Bahraini Dinar", OMR: "Omani Rial", JOD: "Jordanian Dinar",
  EGP: "Egyptian Pound", ILS: "Israeli New Shekel", TRY: "Turkish Lira",
  ISK: "Icelandic Króna", PKR: "Pakistani Rupee", BDT: "Bangladeshi Taka",
  LKR: "Sri Lankan Rupee", NPR: "Nepalese Rupee", KES: "Kenyan Shilling",
  NGN: "Nigerian Naira", UAH: "Ukrainian Hryvnia", MAD: "Moroccan Dirham",
};

export function currencyName(currency: CurrencyCode): string {
  return CURRENCY_NAMES[currency];
}
