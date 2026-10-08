import {
  currencyPrecision,
  inferCategorySlug,
  inferReceiptCategory,
  isCategorySlug,
  isCurrencyCode,
  type CategorySlug,
  type CurrencyCode,
  type ExpenseDraft,
  type ParsedReceipt,
  type ReceiptReview,
} from "@template/shared";

/** Fields an assistant (receipt scan or a typed sentence) can fill in. */
export type PersonalDraft = {
  amountMinor: number | null;
  currency: CurrencyCode;
  description: string | null;
  merchant: string | null;
  date: string | null;
  category: CategorySlug;
  /** Plain-language reason to double-check the result, or null when it added up. */
  checkHint: string | null;
};

/** Cents (two decimals, as receipts and chat report them) → the currency's minor units. */
function centsToMinor(cents: number, currency: CurrencyCode): number {
  return Math.round((cents * 10 ** currencyPrecision(currency)) / 100);
}

export function receiptToPersonalDraft(
  receipt: ParsedReceipt,
  review: ReceiptReview | null,
  fallbackCurrency: CurrencyCode,
): PersonalDraft {
  const printed = review?.currency.value;
  // Receipt amounts are read with two decimals; only adopt a printed currency that has two.
  const currency =
    printed && isCurrencyCode(printed) && currencyPrecision(printed) === 2 ? printed : fallbackCurrency;
  const total = review?.total_cents.value ?? receipt.total_cents;
  const merchant = receipt.merchant?.trim() || null;
  let checkHint: string | null = null;
  if (!total || total <= 0) checkHint = "Talli couldn’t find the total. Enter it from the receipt.";
  else if (review && review.total_cents.state !== "verified")
    checkHint = "Check the total against the receipt — part of it was hard to read.";
  else if (review?.overall === "needs_review")
    checkHint = "The items don’t add up to the total. The total is used; check it.";
  return {
    amountMinor: total && total > 0 ? centsToMinor(total, currency) : null,
    currency,
    description: merchant,
    merchant,
    date: review?.date.value ?? receipt.date ?? null,
    category: inferReceiptCategory(
      merchant,
      receipt.line_items.map((item) => item.description),
    ),
    checkHint,
  };
}

export function chatToPersonalDraft(draft: ExpenseDraft, currency: CurrencyCode): PersonalDraft {
  const description = draft.item_name.trim() || null;
  const category: CategorySlug = isCategorySlug(draft.category_slug)
    ? draft.category_slug
    : (inferCategorySlug(description) ?? "other");
  return {
    amountMinor: draft.amount_cents > 0 ? centsToMinor(draft.amount_cents, currency) : null,
    currency,
    description,
    merchant: null,
    date: draft.date,
    category,
    checkHint: null,
  };
}
