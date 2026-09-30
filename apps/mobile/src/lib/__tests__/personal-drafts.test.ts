import { describe, expect, it } from "vitest";
import type { ExpenseDraft, ParsedReceipt, ReceiptReview } from "@template/shared";
import { chatToPersonalDraft, receiptToPersonalDraft } from "../personal/drafts";

const receipt: ParsedReceipt = {
  merchant: "Mendokoro Ramenba",
  date: "2026-09-28",
  line_items: [{ description: "Shoyu ramen", quantity: 1, unit_price_cents: 45000, total_cents: 45000 }],
  subtotal_cents: 45000,
  tax_cents: null,
  total_cents: 45000,
  raw_text: "",
  confidence: 0.9,
};

function review(overrides: Partial<ReceiptReview> = {}): ReceiptReview {
  const field = <T,>(value: T) => ({ value, state: "verified" as const, note: null });
  return {
    merchant: field("Mendokoro Ramenba"),
    date: field("2026-09-28"),
    currency: field("PHP"),
    subtotal_cents: field(45000),
    tax_cents: field(null),
    tax_inclusive: true,
    service_charge_cents: field(null),
    discount_cents: field(null),
    tip_cents: field(null),
    total_cents: field(45000),
    items: [],
    overall: "verified",
    issues: [],
    raw_text: "",
    ...overrides,
  };
}

describe("receiptToPersonalDraft", () => {
  it("maps a verified receipt without a warning", () => {
    expect(receiptToPersonalDraft(receipt, review(), "USD")).toEqual({
      amountMinor: 45000,
      currency: "PHP",
      description: "Mendokoro Ramenba",
      merchant: "Mendokoro Ramenba",
      date: "2026-09-28",
      category: "food-drinks",
      checkHint: null,
    });
  });

  it("asks for a check when the total was not verified", () => {
    const draft = receiptToPersonalDraft(
      receipt,
      review({ total_cents: { value: 45000, state: "likely", note: null } }),
      "PHP",
    );
    expect(draft.checkHint).toMatch(/Check the total/);
  });

  it("keeps the person's currency when the receipt's has other decimals", () => {
    const draft = receiptToPersonalDraft(receipt, review({ currency: { value: "JPY", state: "likely", note: null } }), "PHP");
    expect(draft.currency).toBe("PHP");
  });

  it("leaves the amount empty when there is no total", () => {
    const draft = receiptToPersonalDraft({ ...receipt, total_cents: 0 }, null, "PHP");
    expect(draft.amountMinor).toBeNull();
    expect(draft.checkHint).toMatch(/couldn’t find the total/);
  });
});

describe("chatToPersonalDraft", () => {
  const draft: ExpenseDraft = {
    item_name: "Grab to BGC",
    amount_cents: 32000,
    confidence: 1,
    participant_names: [],
    payer_name: null,
    category_slug: null,
    notes: null,
    date: "2026-09-30",
    source: "conversation",
  };

  it("converts cents to the currency's minor units", () => {
    expect(chatToPersonalDraft(draft, "PHP")).toMatchObject({ amountMinor: 32000, category: "transport" });
    expect(chatToPersonalDraft({ ...draft, amount_cents: 150000 }, "JPY").amountMinor).toBe(1500);
  });
});
