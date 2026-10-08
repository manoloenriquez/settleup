import { describe, it, expect } from "vitest";
import {
  normalizeReceiptDate,
  parseReceiptAmount,
  reconcileReceiptExtraction,
  reviewToParsedReceipt,
  type ReceiptExtractionInput,
} from "../utils/receipt-reconcile";

function extraction(overrides: Partial<ReceiptExtractionInput>): ReceiptExtractionInput {
  return {
    merchant: null,
    date: null,
    currency: "PHP",
    subtotal: null,
    tax: null,
    serviceCharge: null,
    discount: null,
    tip: null,
    total: null,
    items: [],
    ocrRows: [],
    ...overrides,
  };
}

/** Bar receipt: inclusive VAT, service charge, total printed twice. */
const barRows = [
  "SALES INVOICE",
  "PRINT BILL ONLY(NOT AN OFFICIAL RECEIPT)",
  "04/01/2026",
  "Server: Jessica  1:13 AM",
  "601/1  30105",
  "Guests: 2",
  "Hoegarden Large  420.00",
  "Stella Artois Large  420.00",
  "Sht Jin Bean  250.00",
  "Complete Subtotal  1,090.00",
  "Service Charge  109.00",
  "Total  1,199.00",
  "Balance Due  1,199.00",
  "12.00% NET: 973.21 VAT: 116.79",
  "NOT VALID FOR INPUT TAX",
];

/** Restaurant slip: decoy "Total", faded service charge, OCR-damaged gross sales. */
const slipRows = [
  "BDO  AMERICAN",
  "pay  EXPRESS",
  "Bill",
  "Slip: 000001070A000073742",
  "Staff: Hanna",
  "Date:  03/22/26 3:05 AM",
  "Table: 33",
  "Description  U-Cost Qty  Amount",
  "NYCSBury Skille 575.00  575.0",
  "Big League  395.00  395.00",
  "Pancake 2pcs  288.00  200.00",
  "Sd Sausage 2pcs 135.00  135.00",
  "Gross Sales  1,395,05",
  "Price Excl. of VAT  1,236.61",
  "Add: 12% VAT  148.39",
  "Total  1,385.00",
  "Service Charge 10%",
  "TOTAL AHOUNT  1,508.66",
  "VATable Sales  Amount  VAT Ast.",
  "1,236.61  148.39",
  "VAT Exempt Sales  123.66  0.00",
  "Date Issued: 08/31/2018",
];

/** Long bill: two-unit line, promo discount in parentheses, total due twice. */
const kiwamiRows = [
  "KIWAMI BGC",
  "Unit 101& 102 NE-LG LowerGround Floor",
  "BILL SLIP",
  "Table No. 33A",
  "19:46:25",
  "03/24/2026",
  "Coke Zero  125.00  125.00",
  "Goma Salmon - 8pcs  635.00  635.00",
  "Rosu Tornado Omelet Curry 120g - Brown Rice  570.00  1140.00",
  "Hokkaido Milk w/ Lengua de Gato  150:00  150.00",
  "Tetal Amount  2050.00",
  "Service Charge (10%)  205.00",
  "（820.00）",
  "40% BDO PROMO",
  "Total Due  1435.00",
  "TOTAL No. of ITEMS: 5",
  "VAT Amount (12%)  219.64",
  "Total Amt Due  1435.00",
];

describe("parseReceiptAmount", () => {
  it("parses standard, thousands, colon and comma-damaged amounts", () => {
    expect(parseReceiptAmount("1,508.66")).toBe(150866);
    expect(parseReceiptAmount("4625.00")).toBe(462500);
    expect(parseReceiptAmount("150:00")).toBe(15000);
    expect(parseReceiptAmount("1,395,05")).toBe(139505);
    expect(parseReceiptAmount("₱ 250.00")).toBe(25000);
  });
  it("treats parentheses as deductions and rejects non-amounts", () => {
    expect(parseReceiptAmount("(1,850.00)")).toBe(-185000);
    expect(parseReceiptAmount("（820.00）".replace(/[（）]/g, (c) => (c === "（" ? "(" : ")")))).toBe(-82000);
    expect(parseReceiptAmount("19:46:25")).toBeNull();
    expect(parseReceiptAmount("33A")).toBeNull();
  });
});

describe("normalizeReceiptDate", () => {
  it("normalises Philippine and ISO formats", () => {
    expect(normalizeReceiptDate("03/22/26")).toBe("2026-03-22");
    expect(normalizeReceiptDate("Date: 03/24/2026 19:46")).toBe("2026-03-24");
    expect(normalizeReceiptDate("2026-04-01")).toBe("2026-04-01");
    expect(normalizeReceiptDate("22/03/2026")).toBe("2026-03-22");
    expect(normalizeReceiptDate("October 23, 2023")).toBe("2023-10-23");
  });
  it("rejects impossible dates and junk", () => {
    expect(normalizeReceiptDate("13/40/2026")).toBeNull();
    expect(normalizeReceiptDate("Table 33")).toBeNull();
    expect(normalizeReceiptDate(null)).toBeNull();
  });
});

describe("reconcileReceiptExtraction", () => {
  it("verifies a clean inclusive-VAT receipt and fixes invented quantities", () => {
    const review = reconcileReceiptExtraction(
      extraction({
        date: "04/01/2026",
        subtotal: 3860,
        tax: 116.79,
        serviceCharge: 109,
        discount: 0,
        total: 1199,
        items: [
          { name: "Hoegarden Large", quantity: 4, unitPrice: 420, totalPrice: 1680 },
          { name: "Stella Artois Large", quantity: 4, unitPrice: 420, totalPrice: 1680 },
          { name: "Sht Jin Bean", quantity: 2, unitPrice: 250, totalPrice: 500 },
        ],
        ocrRows: barRows,
      }),
    );
    expect(review.items.map((i) => [i.quantity, i.total_cents, i.state])).toEqual([
      [1, 42000, "verified"],
      [1, 42000, "verified"],
      [1, 25000, "verified"],
    ]);
    expect(review.subtotal_cents).toMatchObject({ value: 109000, state: "likely" });
    expect(review.service_charge_cents).toMatchObject({ value: 10900, state: "verified" });
    expect(review.tax_cents).toMatchObject({ value: 11679, state: "verified" });
    expect(review.tax_inclusive).toBe(true);
    expect(review.total_cents).toMatchObject({ value: 119900, state: "verified" });
    expect(review.discount_cents).toMatchObject({ value: null, state: "missing" });
    expect(review.date).toMatchObject({ value: "2026-04-01", state: "verified" });
    expect(review.merchant.state).toBe("missing");
    // The subtotal had to be derived from the items, so the whole receipt is "likely", not "verified".
    expect(review.overall).toBe("likely");
  });

  it("prefers the final printed total over a decoy and derives a faded service charge", () => {
    const review = reconcileReceiptExtraction(
      extraction({
        merchant: "BDO AMERICAN",
        date: "03/22/26",
        subtotal: 1395.05,
        tax: 148.39,
        serviceCharge: 150.87,
        total: 1508.66,
        items: [
          { name: "NYCSBury Skille", quantity: 5, unitPrice: 575, totalPrice: 575 },
          { name: "Big League", quantity: 3, unitPrice: 395, totalPrice: 395 },
          { name: "Pancake 2pcs", quantity: 2, unitPrice: 288, totalPrice: 200 },
          { name: "Sd Sausage 2pcs", quantity: 2, unitPrice: 135, totalPrice: 135 },
        ],
        ocrRows: slipRows,
      }),
    );
    expect(review.items.map((i) => i.total_cents)).toEqual([57500, 39500, 20000, 13500]);
    expect(review.items.every((i) => i.quantity === 1)).toBe(true);
    // Items add to 1,305.00 (the OCR read the pancake as 200.00); the receipt's 1,385.00 cannot be
    // reproduced, so the subtotal is flagged rather than silently replaced.
    expect(review.subtotal_cents.state).toBe("needs_review");
    expect(review.total_cents.value).toBe(150866);
    // Card and wallet brands printed on the bill folder are never the merchant.
    expect(review.merchant).toMatchObject({ value: null, state: "missing" });
    expect(review.date).toMatchObject({ value: "2026-03-22", state: "verified" });
    expect(review.overall).toBe("needs_review");
  });

  it("derives a faded service charge when the items reconcile with the total", () => {
    const rows = slipRows.map((r) => (r === "Pancake 2pcs  288.00  200.00" ? "Pancake 2pcs  280.00  280.00" : r));
    const review = reconcileReceiptExtraction(
      extraction({
        date: "03/22/26",
        subtotal: 1395.05,
        tax: 148.39,
        serviceCharge: 150.87,
        total: 1508.66,
        items: [
          { name: "NYCSBury Skille", quantity: 1, unitPrice: 575, totalPrice: 575 },
          { name: "Big League", quantity: 1, unitPrice: 395, totalPrice: 395 },
          { name: "Pancake 2pcs", quantity: 1, unitPrice: 280, totalPrice: 280 },
          { name: "Sd Sausage 2pcs", quantity: 1, unitPrice: 135, totalPrice: 135 },
        ],
        ocrRows: rows,
      }),
    );
    expect(review.subtotal_cents).toMatchObject({ value: 138500, state: "likely" });
    expect(review.service_charge_cents).toMatchObject({ value: 12366, state: "likely" });
    expect(review.total_cents).toMatchObject({ value: 150866, state: "verified" });
    expect(review.tax_inclusive).toBe(true);
    expect(review.overall).toBe("likely");
  });

  it("handles a promo discount in parentheses and a two-unit line", () => {
    const review = reconcileReceiptExtraction(
      extraction({
        merchant: "KIWAMI BGC",
        date: "03/24/2026",
        subtotal: 1435,
        tax: 219.64,
        serviceCharge: 205,
        discount: 820,
        total: 1435,
        items: [
          { name: "Coke Zero", quantity: 1, unitPrice: 125, totalPrice: 125 },
          { name: "Goma Salmon - 8pcs", quantity: 1, unitPrice: 635, totalPrice: 635 },
          { name: "Rosu Tornado Omelet Curry 120g - Brown Rice", quantity: 1, unitPrice: 1140, totalPrice: 1140 },
          { name: "Hokkaido Milk w/ Lengua de Gato", quantity: 1, unitPrice: 150, totalPrice: 150 },
        ],
        ocrRows: kiwamiRows,
      }),
    );
    const rosu = review.items[2]!;
    expect(rosu).toMatchObject({ quantity: 2, unit_price_cents: 57000, total_cents: 114000, state: "verified" });
    expect(review.subtotal_cents).toMatchObject({ value: 205000, state: "likely" });
    expect(review.discount_cents).toMatchObject({ value: 82000, state: "verified" });
    expect(review.service_charge_cents).toMatchObject({ value: 20500, state: "verified" });
    expect(review.total_cents).toMatchObject({ value: 143500, state: "verified" });
    expect(review.merchant).toMatchObject({ value: "KIWAMI BGC", state: "likely" });
    expect(review.overall).toBe("likely");
  });

  it("recognises additive tax and tips", () => {
    const review = reconcileReceiptExtraction(
      extraction({
        merchant: "Joe's Diner",
        subtotal: 100,
        tax: 8,
        tip: 20,
        total: 128,
        items: [{ name: "Burger", quantity: 1, unitPrice: 100, totalPrice: 100 }],
        ocrRows: ["Joe's Diner", "Burger  100.00", "Subtotal  100.00", "Tax  8.00", "Tip  20.00", "Total  128.00"],
      }),
    );
    expect(review.tax_inclusive).toBe(false);
    expect(review.tip_cents).toMatchObject({ value: 2000, state: "verified" });
    expect(review.total_cents).toMatchObject({ value: 12800, state: "verified" });
    expect(review.overall).toBe("verified");
  });

  it("flags a total that the arithmetic cannot explain", () => {
    const review = reconcileReceiptExtraction(
      extraction({
        subtotal: 300,
        total: 999,
        items: [
          { name: "Tea", quantity: 1, unitPrice: 100, totalPrice: 100 },
          { name: "Cake", quantity: 1, unitPrice: 200, totalPrice: 200 },
        ],
        ocrRows: ["Tea  100.00", "Cake  200.00", "Subtotal  300.00", "Total  999.00"],
      }),
    );
    expect(review.total_cents.state).toBe("needs_review");
    expect(review.overall).toBe("needs_review");
    expect(review.issues.some((i) => i.includes("₱999.00"))).toBe(true);
  });

  it("computes a missing total and flags items whose price is not in the scan", () => {
    const review = reconcileReceiptExtraction(
      extraction({
        items: [
          { name: "Tea", quantity: 1, unitPrice: 100, totalPrice: 100 },
          { name: "Mystery", quantity: 1, unitPrice: 55, totalPrice: 55 },
        ],
        ocrRows: ["Tea  100.00", "Service Charge  10.00"],
      }),
    );
    expect(review.items[0]?.state).toBe("verified");
    expect(review.items[1]?.state).toBe("needs_review");
    expect(review.total_cents).toMatchObject({ value: 16500, state: "likely" });
    expect(review.overall).toBe("needs_review");
  });

  it("corrects a 100× shifted total using the arithmetic", () => {
    const review = reconcileReceiptExtraction(
      extraction({
        total: 30000,
        items: [
          { name: "Tea", quantity: 1, unitPrice: 100, totalPrice: 100 },
          { name: "Cake", quantity: 1, unitPrice: 200, totalPrice: 200 },
        ],
        ocrRows: ["Tea  100.00", "Cake  200.00", "Total  300.00"],
      }),
    );
    expect(review.total_cents).toMatchObject({ value: 30000, state: "likely" });
  });

  it("moves a service charge the model listed as an item into the charges", () => {
    const review = reconcileReceiptExtraction(
      extraction({
        subtotal: 1090,
        total: 1199,
        items: [
          { name: "Hoegarden Large", quantity: 1, unitPrice: 420, totalPrice: 420 },
          { name: "Stella Artois Large", quantity: 1, unitPrice: 420, totalPrice: 420 },
          { name: "Sht Jim Beam", quantity: 1, unitPrice: 250, totalPrice: 250 },
          { name: "Service Charge", quantity: 1, unitPrice: 109, totalPrice: 109 },
        ],
        ocrRows: barRows,
      }),
    );
    expect(review.items).toHaveLength(3);
    expect(review.service_charge_cents).toMatchObject({ value: 10900, state: "verified" });
    expect(review.total_cents).toMatchObject({ value: 119900, state: "verified" });
  });

  it("marks everything missing when nothing was read", () => {
    const review = reconcileReceiptExtraction(extraction({ ocrRows: [] }));
    expect(review.total_cents.state).toBe("missing");
    expect(review.overall).toBe("needs_review");
    expect(reviewToParsedReceipt(review).total_cents).toBe(0);
  });

  it("projects onto the legacy ParsedReceipt shape", () => {
    const review = reconcileReceiptExtraction(
      extraction({
        merchant: "Joe's Diner",
        date: "2026-01-02",
        subtotal: 100,
        tax: 8,
        total: 108,
        items: [{ name: "Burger", quantity: 1, unitPrice: 100, totalPrice: 100 }],
        ocrRows: ["Joe's Diner", "2026-01-02", "Burger  100.00", "Subtotal  100.00", "Tax  8.00", "Total  108.00"],
      }),
    );
    const parsed = reviewToParsedReceipt(review);
    expect(parsed).toMatchObject({ merchant: "Joe's Diner", date: "2026-01-02", subtotal_cents: 10000, tax_cents: 800, total_cents: 10800 });
    expect(parsed.line_items).toEqual([{ description: "Burger", quantity: 1, unit_price_cents: 10000, total_cents: 10000 }]);
    expect(parsed.confidence).toBeGreaterThan(0.9);
  });
});
