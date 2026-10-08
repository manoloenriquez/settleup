import type { ParsedReceipt, ReceiptLineItem } from "../types/ai";

// ---------------------------------------------------------------------------
// Deterministic receipt reconciliation
//
// The on-device language model reads a receipt's OCR rows and returns a
// structured guess. Small models are good at recognising which row is the
// merchant, an item, or the total, and bad at arithmetic and quantities. This
// module therefore treats the model output as a set of labels and re-derives
// every number from the OCR rows and from receipt arithmetic. Each field gets a
// review state based on evidence, never on a model-reported confidence:
//
//   verified      value appears verbatim in the OCR text and the arithmetic agrees
//   likely        value was derived deterministically (e.g. subtotal from items)
//   needs_review  value conflicts with the OCR text or the arithmetic
//   missing       no value could be established
// ---------------------------------------------------------------------------

export type ReceiptExtractionInput = {
  merchant: string | null;
  date: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  serviceCharge: number | null;
  discount: number | null;
  tip: number | null;
  total: number | null;
  items: { name: string; quantity: number | null; unitPrice: number | null; totalPrice: number | null }[];
  ocrRows: string[];
};

export type FieldState = "verified" | "likely" | "needs_review" | "missing";

export type ReviewField<T> = { value: T; state: FieldState; note: string | null };

export type ReceiptReviewItem = {
  name: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  state: FieldState;
};

export type ReceiptReview = {
  merchant: ReviewField<string | null>;
  date: ReviewField<string | null>;
  currency: ReviewField<string>;
  subtotal_cents: ReviewField<number | null>;
  tax_cents: ReviewField<number | null>;
  /** True when the printed VAT is already inside the item prices (the Philippine default). */
  tax_inclusive: boolean;
  service_charge_cents: ReviewField<number | null>;
  discount_cents: ReviewField<number | null>;
  tip_cents: ReviewField<number | null>;
  total_cents: ReviewField<number | null>;
  items: ReceiptReviewItem[];
  overall: "verified" | "likely" | "needs_review";
  issues: string[];
  raw_text: string;
};

// -- Amount parsing ----------------------------------------------------------

/**
 * Money as printed on receipts, including common OCR damage: "1,508.66",
 * "4625.00", "150:00" (colon for a faded point), "1,395,05" (comma for a
 * point), "(1,850.00)" (parentheses for a deduction).
 */
const AMOUNT_PATTERN = /\(?(?<![\d:/-])(?:\d{1,3}(?:[,.]\d{3})+|\d+)[.:,]\d{2}\)?(?![\d%])/g;

export function parseReceiptAmount(raw: string): number | null {
  const text = raw.trim();
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  const body = text.replace(/[()\s₱P-]/g, "");
  const match = /^(\d{1,3}(?:[,.]\d{3})+|\d+)[.:,](\d{2})$/.exec(body);
  if (!match?.[1] || !match[2]) return null;
  const whole = Number.parseInt(match[1].replace(/[,.]/g, ""), 10);
  const cents = whole * 100 + Number.parseInt(match[2], 10);
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

type OcrRow = {
  text: string;
  lower: string;
  /** Amounts in printed order, in cents. Parenthesised amounts are negative. */
  amounts: number[];
  /** Absolute values of the amounts, for membership checks. */
  magnitudes: number[];
};

function parseRows(rows: string[]): OcrRow[] {
  return rows.map((text) => {
    const amounts = [...text.matchAll(AMOUNT_PATTERN)]
      .map((m) => parseReceiptAmount(m[0]))
      .filter((cents): cents is number => cents !== null);
    return { text, lower: text.toLowerCase(), amounts, magnitudes: amounts.map(Math.abs) };
  });
}

function pesosToCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Receipts add up exactly apart from centavo rounding; anything past this is a real difference. */
const EXACT_TOLERANCE_CENTS = 5;

/** Loose tolerance for calling a near miss "likely" instead of "needs review": max(₱1, 2% of the total). */
export function receiptTolerance(totalCents: number): number {
  return Math.max(100, Math.round(Math.abs(totalCents) * 0.02));
}

// -- Dates -------------------------------------------------------------------

/**
 * Normalises receipt dates to YYYY-MM-DD. Philippine receipts print MM/DD/YYYY
 * or MM/DD/YY; when the first number cannot be a month the order is DD/MM.
 */
export function normalizeReceiptDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return isValidDate(iso[1]!, iso[2]!, iso[3]!) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  const slash = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(raw);
  if (slash) {
    let a = Number.parseInt(slash[1]!, 10);
    let b = Number.parseInt(slash[2]!, 10);
    const yearRaw = slash[3]!;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    if (a > 12 && b <= 12) [a, b] = [b, a];
    const month = String(a).padStart(2, "0");
    const day = String(b).padStart(2, "0");
    return isValidDate(year, month, day) ? `${year}-${month}-${day}` : null;
  }
  const textual = /([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/.exec(raw);
  if (textual) {
    const month = MONTHS.indexOf(textual[1]!.slice(0, 3).toLowerCase());
    if (month >= 0) {
      const mm = String(month + 1).padStart(2, "0");
      const dd = textual[2]!.padStart(2, "0");
      return isValidDate(textual[3]!, mm, dd) ? `${textual[3]}-${mm}-${dd}` : null;
    }
  }
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function isValidDate(year: string, month: string, day: string): boolean {
  const y = Number(year), m = Number(month), d = Number(day);
  return y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/** First printed transaction date in the OCR rows (skips accreditation dates in the footer). */
function findOcrDate(rows: OcrRow[]): string | null {
  for (const row of rows) {
    if (/issued|accred|ptu|valid until|expir/.test(row.lower)) continue;
    const date = normalizeReceiptDate(row.text);
    if (date) return date;
  }
  return null;
}

// -- Text matching -----------------------------------------------------------

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string): string[] {
  return normalizeText(value).split(" ").filter((t) => t.length >= 2);
}

/** Fraction of the item name's tokens that occur (as prefixes, to survive OCR slips) in the row. */
function nameOverlap(name: string, row: OcrRow): number {
  const want = tokens(name);
  if (want.length === 0) return 0;
  const have = tokens(row.text);
  let hits = 0;
  for (const token of want) {
    if (have.some((h) => h === token || (token.length >= 4 && h.startsWith(token.slice(0, 4))) || (h.length >= 4 && token.startsWith(h.slice(0, 4))))) hits += 1;
  }
  return hits / want.length;
}

const CHARGE_ROW = /\b(sub\s*total|subtotal|gross\s*sales|total|amount\s*due|amt\s*due|balance\s*due|vat|tax|service\s*charge|s\.?c\.?\s*\d|discount|disc\b|promo|tip|gratuity|cash|change|tender|card|net\b|vatable|exempt|zero.rated|payment)/;
const NOT_MERCHANT = /\b(official\s*receipt|sales\s*invoice|bill\s*slip|^bill$|print\s*bill|not\s*an\s*official|tin\b|vat\s*reg|accred|ptu|pos\s*provider|table|slip|staff|server|guest|cashier|register|date|time|order|dine|take.?out|receipt\s*no|invoice\s*no|amex|american\s*express|visa|mastercard|bdo|bpi|gcash|maya)\b/;

const LABELS = {
  total: /\b(total\s*amount\s*due|total\s*amt\s*due|amount\s*due|amt\s*due|total\s*due|grand\s*total|balance\s*due|total\s*amount|total\s*payable|^total$|\btotal\b)/,
  subtotal: /\b(sub\s*total|subtotal|complete\s*subtotal|gross\s*sales|total\s*amount)\b/,
  tax: /\b(vat\s*amount|add:?\s*\d{1,2}%\s*vat|vat\b|e?vat|sales\s*tax|tax)\b/,
  serviceCharge: /\b(service\s*charge|svc\s*chg|s\.?c\.?\s*\d{1,2}%)/,
  discount: /\b(discount|disc\b|promo|sc\s*disc|pwd\s*disc|senior|less\b|voucher|coupon)/,
  tip: /\b(tip|gratuity)\b/,
} as const;

const TOTAL_EXCLUDE = /\b(sub\s*total|subtotal|no\.?\s*of\s*items|items\s*:|qty|vatable|exempt|zero.rated|net\b|vat)\b/;

function labelledAmounts(rows: OcrRow[], label: RegExp, exclude?: RegExp): number[] {
  const out: number[] = [];
  for (const row of rows) {
    if (row.amounts.length === 0 || !label.test(row.lower)) continue;
    if (exclude && exclude.test(row.lower)) continue;
    out.push(row.amounts[row.amounts.length - 1]!);
  }
  return out;
}

// -- Items -------------------------------------------------------------------

const QTY_PREFIX = /^\s*(\d{1,2})\s*(?:x|×|@|pcs?\b)/i;
const CIRCLED_DIGITS = "①②③④⑤⑥⑦⑧⑨";

/** "x2" / "×2" printed after the name: "Kaya Toast Set  x2  13.60". */
const QTY_MARKER = /(?:^|\s)[x×]\s?(\d{1,2})(?=\s|$)/i;
/** A quantity column: "2  1pc Chickenjoy  198.00" (only on receipts with a QTY header). */
const QTY_COLUMN = /^\s*(\d{1,2})\s{1,}(?=\S*\p{L})/u;
/** A quantity sub-line under the item: "3 x 134.00", "2 @ 45.00". */
const QTY_SUBLINE = /^\s*(\d{1,2})\s*(?:x|×|@)\s*([\d.,]+)\s*$/i;

function splitBy(qty: number, totalCents: number): { quantity: number; unit_price_cents: number } | null {
  return qty >= 2 && qty <= 99 && totalCents % qty === 0 ? { quantity: qty, unit_price_cents: totalCents / qty } : null;
}

/**
 * Quantity and unit price for one OCR row, derived only from what is printed:
 * a unit price beside the line total, "2 x"/"2 @" prefixes, an "x2" marker, a
 * quantity column (when the receipt has a QTY header), a "3 x 134.00" line
 * directly below, or circled digits. Every quantity must divide the printed
 * line total exactly; otherwise the line stays quantity 1.
 */
function quantityFromRow(
  row: OcrRow,
  totalCents: number,
  context: { next?: OcrRow; qtyColumn: boolean } = { qtyColumn: false },
): { quantity: number; unit_price_cents: number; usedNext?: boolean } {
  const magnitudes = row.magnitudes;
  if (magnitudes.length >= 2) {
    const unit = magnitudes[0]!;
    if (unit > 0 && unit !== totalCents) {
      const ratio = totalCents / unit;
      const rounded = Math.round(ratio);
      if (rounded >= 2 && rounded <= 99 && Math.abs(ratio - rounded) < 0.02) {
        return { quantity: rounded, unit_price_cents: unit };
      }
    }
  }
  const prefix = QTY_PREFIX.exec(row.text);
  if (prefix?.[1]) {
    const hit = splitBy(Number.parseInt(prefix[1], 10), totalCents);
    if (hit) return hit;
  }
  const marker = QTY_MARKER.exec(row.text);
  if (marker?.[1]) {
    const hit = splitBy(Number.parseInt(marker[1], 10), totalCents);
    if (hit) return hit;
  }
  if (context.qtyColumn) {
    const column = QTY_COLUMN.exec(row.text);
    if (column?.[1]) {
      const hit = splitBy(Number.parseInt(column[1], 10), totalCents);
      if (hit) return hit;
    }
  }
  const sub = context.next ? QTY_SUBLINE.exec(context.next.text) : null;
  if (sub?.[1] && context.next?.magnitudes[0]) {
    const qty = Number.parseInt(sub[1], 10);
    const unit = context.next.magnitudes[0];
    if (qty >= 2 && qty <= 99 && qty * unit === totalCents) return { quantity: qty, unit_price_cents: unit, usedNext: true };
  }
  for (let i = 0; i < CIRCLED_DIGITS.length; i += 1) {
    if (row.text.includes(CIRCLED_DIGITS[i]!) && i >= 1 && totalCents % (i + 1) === 0) {
      return { quantity: i + 1, unit_price_cents: totalCents / (i + 1) };
    }
  }
  return { quantity: 1, unit_price_cents: totalCents };
}

function isChargeLike(name: string): boolean {
  return CHARGE_ROW.test(name.toLowerCase());
}

// -- Reconciliation ----------------------------------------------------------

export function reconcileReceiptExtraction(input: ReceiptExtractionInput): ReceiptReview {
  const rows = parseRows(input.ocrRows);
  const ocrMagnitudes = new Set(rows.flatMap((r) => r.magnitudes));
  const issues: string[] = [];
  const inOcr = (cents: number | null): boolean => cents !== null && ocrMagnitudes.has(Math.abs(cents));

  // Merchant ------------------------------------------------------------------
  let merchant: ReviewField<string | null>;
  const merchantName = input.merchant?.trim() || null;
  if (!merchantName || NOT_MERCHANT.test(merchantName.toLowerCase()) || isChargeLike(merchantName)) {
    merchant = { value: null, state: "missing", note: "No business name was printed near the top of the receipt." };
  } else {
    const wanted = normalizeText(merchantName);
    const headerRows = rows.slice(0, 10);
    const seen = headerRows.some((row) => {
      const printed = normalizeText(row.text);
      return printed.includes(wanted) || (printed.length >= 3 && wanted.includes(printed));
    });
    merchant = seen
      ? { value: merchantName, state: "likely", note: null }
      : { value: merchantName, state: "needs_review", note: "This name does not appear in the scanned text." };
  }

  // Date ----------------------------------------------------------------------
  const modelDate = normalizeReceiptDate(input.date);
  const ocrDate = findOcrDate(rows);
  let date: ReviewField<string | null>;
  if (modelDate && ocrDate) {
    date = modelDate === ocrDate
      ? { value: modelDate, state: "verified", note: null }
      : { value: ocrDate, state: "needs_review", note: `Scanned text shows ${ocrDate}; the model read ${modelDate}.` };
  } else if (ocrDate) {
    date = { value: ocrDate, state: "likely", note: null };
  } else if (modelDate) {
    date = { value: modelDate, state: "needs_review", note: "Date was not found in the scanned text." };
  } else {
    date = { value: null, state: "missing", note: "No date was found on the receipt." };
  }

  // Currency ------------------------------------------------------------------
  const rawCurrency = (input.currency ?? "").toUpperCase();
  const currency: ReviewField<string> = /^[A-Z]{3}$/.test(rawCurrency) && rawCurrency !== "PHP"
    ? { value: rawCurrency, state: "needs_review", note: "This receipt may not be in Philippine pesos." }
    : { value: "PHP", state: rawCurrency === "PHP" ? "verified" : "likely", note: null };

  // Items ---------------------------------------------------------------------
  const chargeIndexes = new Set<number>();
  rows.forEach((row, index) => {
    if (row.amounts.length > 0 && CHARGE_ROW.test(row.lower)) chargeIndexes.add(index);
  });
  const usedRows = new Set<number>();
  const items: ReceiptReviewItem[] = [];
  const qtyColumn = rows.some((row) => /^\s*(qty|quantity)\b/i.test(row.text));
  // "3 x 134.00" lines belong to the item above, never items of their own.
  rows.forEach((row, index) => {
    if (QTY_SUBLINE.test(row.text)) usedRows.add(index);
  });
  const misfiled: { name: string; cents: number }[] = [];

  for (const item of input.items) {
    const name = item.name.trim();
    if (!name) continue;
    // "3 x 134.00" is the quantity line of the item above, not an item.
    if (QTY_SUBLINE.test(name)) continue;
    const modelTotal = pesosToCents(item.totalPrice);
    if (isChargeLike(name)) {
      if (modelTotal) misfiled.push({ name, cents: modelTotal });
      continue;
    }
    let match: { index: number; score: number } | null = null;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]!;
      if (usedRows.has(index) || chargeIndexes.has(index) || row.amounts.length === 0) continue;
      let score = nameOverlap(name, row);
      if (score === 0) continue;
      if (modelTotal !== null && row.magnitudes.includes(modelTotal)) score += 0.5;
      if (!match || score > match.score) match = { index, score };
    }
    if (match && match.score >= 0.5) {
      usedRows.add(match.index);
      const row = rows[match.index]!;
      const totalCents = row.magnitudes[row.magnitudes.length - 1]!;
      const { quantity, unit_price_cents } = quantityFromRow(row, totalCents, { next: rows[match.index + 1], qtyColumn });
      items.push({ name, quantity, unit_price_cents, total_cents: totalCents, state: "verified" });
      continue;
    }
    if (modelTotal !== null && modelTotal > 0 && inOcr(modelTotal)) {
      const unit = pesosToCents(item.unitPrice);
      const qty = item.quantity && item.quantity >= 1 && unit && Math.abs(unit * item.quantity - modelTotal) <= 1 ? Math.round(item.quantity) : 1;
      items.push({ name, quantity: qty, unit_price_cents: qty > 1 ? Math.round(modelTotal / qty) : modelTotal, total_cents: modelTotal, state: "likely" });
      continue;
    }
    if (modelTotal !== null && modelTotal > 0) {
      items.push({ name, quantity: 1, unit_price_cents: modelTotal, total_cents: modelTotal, state: "needs_review" });
      issues.push(`"${name}" price ${formatCents(modelTotal)} was not found in the scanned text.`);
    } else {
      items.push({ name, quantity: 1, unit_price_cents: 0, total_cents: 0, state: "needs_review" });
      issues.push(`"${name}" has no readable price.`);
    }
  }

  // Charges from model + OCR labels ------------------------------------------
  const zeroToNull = (cents: number | null): number | null => (cents === 0 ? null : cents);
  const modelSubtotal = zeroToNull(pesosToCents(input.subtotal));
  const modelTax = zeroToNull(pesosToCents(input.tax));
  const modelService = zeroToNull(pesosToCents(input.serviceCharge)) ?? misfiled.find((m) => LABELS.serviceCharge.test(m.name.toLowerCase()))?.cents ?? null;
  const modelDiscount = zeroToNull(pesosToCents(input.discount)) ?? misfiled.find((m) => LABELS.discount.test(m.name.toLowerCase()))?.cents ?? null;
  const modelTip = zeroToNull(pesosToCents(input.tip));
  const modelTotal = zeroToNull(pesosToCents(input.total));

  const ocrTotals = labelledAmounts(rows, LABELS.total, TOTAL_EXCLUDE);
  const ocrSubtotals = labelledAmounts(rows, LABELS.subtotal, /\b(due|amt|no\.?\s*of)\b/);
  const ocrTaxes = labelledAmounts(rows, LABELS.tax, /\b(vatable|exempt|zero.rated|reg|tin|sales\s*\d)\b/);
  const ocrService = labelledAmounts(rows, LABELS.serviceCharge);
  const ocrDiscounts = labelledAmounts(rows, LABELS.discount).map(Math.abs);
  const ocrTips = labelledAmounts(rows, LABELS.tip);
  // A parenthesised amount on its own row is a deduction; the label is often on the neighbouring row.
  rows.forEach((row, index) => {
    if (row.amounts.length === 1 && row.amounts[0]! < 0) {
      const neighbours = [rows[index - 1], rows[index + 1]].filter((r): r is OcrRow => !!r);
      if (neighbours.some((r) => LABELS.discount.test(r.lower))) ocrDiscounts.push(Math.abs(row.amounts[0]!));
    }
  });

  const pick = (model: number | null, labelled: number[], name: string): ReviewField<number | null> => {
    if (model !== null && inOcr(model)) {
      const labelledDisagree = labelled.length > 0 && !labelled.includes(Math.abs(model));
      return labelledDisagree
        ? { value: model, state: "likely", note: `A different ${name} amount is printed next to the label.` }
        : { value: model, state: "verified", note: null };
    }
    if (labelled.length > 0) {
      const value = labelled[labelled.length - 1]!;
      return model === null
        ? { value, state: "likely", note: null }
        : { value, state: "likely", note: `Model read ${formatCents(model)}; using the printed ${formatCents(value)}.` };
    }
    if (model !== null) return { value: model, state: "needs_review", note: `${capitalize(name)} ${formatCents(model)} was not found in the scanned text.` };
    return { value: null, state: "missing", note: null };
  };

  let total = pick(modelTotal, ocrTotals, "total");
  // A small model sometimes copies the grand total into every charge field. A charge
  // can never be the whole bill, so such values are discarded before reconciliation.
  const notTheTotal = (cents: number | null): number | null =>
    cents !== null && total.value !== null && Math.abs(cents) >= total.value ? null : cents;
  let subtotal = pick(modelSubtotal, ocrSubtotals, "subtotal");
  let tax = pick(notTheTotal(modelTax), ocrTaxes, "tax");
  let serviceCharge = pick(notTheTotal(modelService), ocrService, "service charge");
  let discount = pick(notTheTotal(modelDiscount === null ? null : Math.abs(modelDiscount)), ocrDiscounts, "discount");
  let tip = pick(notTheTotal(modelTip), ocrTips, "tip");

  // Decoy totals: a receipt may print "Total 1,385.00" and later "TOTAL AMOUNT 1,508.66".
  if (total.value !== null && ocrTotals.length > 0) {
    const printedMax = Math.max(...ocrTotals);
    const earlier = total.value;
    if (printedMax > earlier && earlier === (subtotal.value ?? -1)) {
      total = { value: printedMax, state: "likely", note: `Using the final printed total ${formatCents(printedMax)} instead of the earlier ${formatCents(earlier)}.` };
    }
  }

  // Arithmetic ---------------------------------------------------------------
  const itemsSum = items.reduce((sum, item) => sum + item.total_cents, 0);
  const hasItems = items.length > 0;
  const tol = receiptTolerance(total.value ?? subtotal.value ?? itemsSum);

  if (hasItems) {
    if (subtotal.value === null) {
      subtotal = { value: itemsSum, state: "likely", note: "Subtotal computed from the items." };
    } else if (Math.abs(subtotal.value - itemsSum) > EXACT_TOLERANCE_CENTS) {
      const printed = subtotal.value;
      if (inOcr(itemsSum) || ocrSubtotals.length === 0) {
        subtotal = { value: itemsSum, state: "likely", note: `Subtotal read as ${formatCents(printed)}, but the items add up to ${formatCents(itemsSum)}.` };
      } else if (Math.abs(printed - itemsSum) <= tol) {
        subtotal = { ...subtotal, state: "likely", note: `Items add up to ${formatCents(itemsSum)}; the printed subtotal differs by rounding.` };
      } else {
        subtotal = { ...subtotal, state: "needs_review", note: `Items add up to ${formatCents(itemsSum)}, not ${formatCents(printed)}.` };
        issues.push(`Items add up to ${formatCents(itemsSum)} but the subtotal reads ${formatCents(printed)}.`);
      }
    }
  }

  const base = subtotal.value ?? (hasItems ? itemsSum : null);
  let taxInclusive = true;
  if (base !== null) {
    const charges = (serviceCharge.value ?? 0) + (tip.value ?? 0) - (discount.value ?? 0);
    const inclusiveTotal = base + charges;
    const additiveTotal = inclusiveTotal + (tax.value ?? 0);
    const printedTotal = total.value;
    if (printedTotal === null) {
      total = { value: inclusiveTotal, state: "likely", note: "Total computed from the subtotal and charges." };
      issues.push("No total was printed; it was computed from the items and charges.");
    } else if (Math.abs(printedTotal - inclusiveTotal) <= EXACT_TOLERANCE_CENTS) {
      taxInclusive = true;
    } else if (tax.value !== null && Math.abs(printedTotal - additiveTotal) <= EXACT_TOLERANCE_CENTS) {
      taxInclusive = false;
    } else {
      // Try to explain the gap with a single unverified charge before accepting a near miss.
      const gap = printedTotal - inclusiveTotal;
      const repaired = repairCharge(gap, { serviceCharge, discount, tip, tax }, inOcr, EXACT_TOLERANCE_CENTS);
      if (repaired) {
        ({ serviceCharge, discount, tip, tax } = repaired.fields);
        taxInclusive = repaired.taxInclusive;
        issues.push(repaired.note);
      } else if (Math.abs(gap) <= tol) {
        taxInclusive = true;
        total = { ...total, state: "likely", note: `Items and charges add up to ${formatCents(inclusiveTotal)}; the printed total differs by rounding.` };
      } else if (tax.value !== null && Math.abs(printedTotal - additiveTotal) <= tol) {
        taxInclusive = false;
        total = { ...total, state: "likely", note: `Items, tax and charges add up to ${formatCents(additiveTotal)}; the printed total differs by rounding.` };
      } else if (isDecimalShift(printedTotal, inclusiveTotal)) {
        total = { value: inclusiveTotal, state: "likely", note: `Total read as ${formatCents(printedTotal)} looks shifted by 100×; using ${formatCents(inclusiveTotal)}.` };
      } else {
        total = { ...total, state: "needs_review", note: `Items and charges add up to ${formatCents(inclusiveTotal)}, not ${formatCents(printedTotal)}.` };
        issues.push(`Items and charges add up to ${formatCents(inclusiveTotal)} but the total reads ${formatCents(printedTotal)}.`);
      }
    }
  } else if (total.value === null) {
    total = { value: null, state: "missing", note: "No total could be read." };
    issues.push("No total could be read from the receipt.");
  }

  // Items should reconcile with the subtotal individually as well.
  for (const item of items) {
    if (item.quantity > 1 && Math.abs(item.quantity * item.unit_price_cents - item.total_cents) > 1) {
      item.state = "needs_review";
      issues.push(`"${item.name}": ${item.quantity} × ${formatCents(item.unit_price_cents)} does not equal ${formatCents(item.total_cents)}.`);
    }
  }

  // Charges only count when present: a receipt without a tip is not "less verified".
  const presentCharges = [subtotal, tax, serviceCharge, discount, tip].filter((f) => f.value !== null);
  const critical = [total.state, ...items.map((i) => i.state)];
  const overall: ReceiptReview["overall"] = total.value === null || critical.includes("needs_review")
    ? "needs_review"
    : [...critical, ...presentCharges.map((f) => f.state)].every((s) => s === "verified") && date.state !== "needs_review"
      ? "verified"
      : "likely";

  return {
    merchant,
    date,
    currency,
    subtotal_cents: subtotal,
    tax_cents: tax,
    tax_inclusive: taxInclusive,
    service_charge_cents: serviceCharge,
    discount_cents: discount,
    tip_cents: tip,
    total_cents: total,
    items,
    overall,
    issues,
    raw_text: input.ocrRows.join("\n"),
  };
}

type ChargeFields = {
  serviceCharge: ReviewField<number | null>;
  discount: ReviewField<number | null>;
  tip: ReviewField<number | null>;
  tax: ReviewField<number | null>;
};

/**
 * When items + charges miss the printed total by exactly one plausible amount,
 * a single charge the model invented or dropped explains it. Only accept
 * repairs that the OCR text supports (the derived amount is printed somewhere).
 */
function repairCharge(
  gap: number,
  fields: ChargeFields,
  inOcr: (cents: number | null) => boolean,
  tol: number,
): { fields: ChargeFields; taxInclusive: boolean; note: string } | null {
  const { serviceCharge, discount, tip, tax } = fields;
  // A service charge the model could not read, or read wrongly.
  if (serviceCharge.state !== "verified") {
    const derived = gap + (serviceCharge.value ?? 0);
    if (derived > 0 && inOcr(derived)) {
      return { fields: { ...fields, serviceCharge: { value: derived, state: "likely", note: "Service charge derived from the printed total." } }, taxInclusive: true, note: `Service charge set to ${formatCents(derived)} so the total matches.` };
    }
  }
  // A discount the model missed or mis-signed.
  if (discount.state !== "verified") {
    const derived = (discount.value ?? 0) - gap;
    if (derived > 0 && inOcr(derived)) {
      return { fields: { ...fields, discount: { value: derived, state: "likely", note: "Discount derived from the printed total." } }, taxInclusive: true, note: `Discount set to ${formatCents(derived)} so the total matches.` };
    }
  }
  // An additive tax that the model dropped.
  if (tax.value !== null && Math.abs(gap - tax.value) <= tol) {
    return { fields, taxInclusive: false, note: "Tax is added on top of the subtotal." };
  }
  if (tip.state !== "verified") {
    const derived = gap + (tip.value ?? 0);
    if (derived > 0 && inOcr(derived)) {
      return { fields: { ...fields, tip: { value: derived, state: "likely", note: "Tip derived from the printed total." } }, taxInclusive: true, note: `Tip set to ${formatCents(derived)} so the total matches.` };
    }
  }
  return null;
}

function isDecimalShift(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  return Math.abs(a - b * 100) <= 1 || Math.abs(b - a * 100) <= 1;
}

function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}₱${(Math.abs(cents) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// -- Legacy shape ------------------------------------------------------------

/**
 * Projects a review onto the `ParsedReceipt` shape the expense flows already
 * consume. `confidence` is a deterministic mapping of the overall review state
 * kept only for that legacy field; UI should show the states, not the number.
 */
export function reviewToParsedReceipt(review: ReceiptReview): ParsedReceipt {
  const lineItems: ReceiptLineItem[] = review.items
    .filter((item) => item.total_cents > 0)
    .map((item) => ({
      description: item.name,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      total_cents: item.total_cents,
    }));
  const confidence = review.overall === "verified" ? 0.95 : review.overall === "likely" ? 0.75 : 0.4;
  return {
    merchant: review.merchant.value,
    date: review.date.value,
    line_items: lineItems,
    subtotal_cents: review.subtotal_cents.value,
    tax_cents: review.tax_inclusive ? null : review.tax_cents.value,
    total_cents: review.total_cents.value ?? 0,
    raw_text: review.raw_text,
    confidence,
  };
}
