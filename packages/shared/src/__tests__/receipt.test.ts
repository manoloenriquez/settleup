import { describe, it, expect } from "vitest";
import { parseReceiptWithRegex } from "../utils/receipt";

describe("parseReceiptWithRegex", () => {
  describe("simple bar receipt", () => {
    const text = `SALES INVOICE
PRINT BILL ONLY(NOT AN OFFICIAL RECEIPT)

04/01/2026
Server: Jessica
001/1
Guests: 2
Order Type: DINE-IN

Hoegaarden Large                420.00
Stella Artois Large             420.00
Sht Jim Beam                    250.00

Complete Subtotal             1,090.00

Service Charge                  109.00

Total                         1,199.00

Balance Due                   1,199.00

12.00% NET: 573.21 VAT: 116.79`;

    it("extracts total correctly", () => {
      const result = parseReceiptWithRegex(text);
      expect(result.total_cents).toBe(119900);
    });

    it("extracts line items", () => {
      const result = parseReceiptWithRegex(text);
      expect(result.line_items.length).toBeGreaterThanOrEqual(3);
      const descriptions = result.line_items.map((i) => i.description);
      expect(descriptions.some((d) => /hoegaarden/i.test(d))).toBe(true);
      expect(descriptions.some((d) => /stella/i.test(d))).toBe(true);
      expect(descriptions.some((d) => /jim beam/i.test(d))).toBe(true);
    });

    it("extracts date", () => {
      const result = parseReceiptWithRegex(text);
      expect(result.date).toBe("2026-04-01");
    });

    it("skips non-merchant headers", () => {
      const result = parseReceiptWithRegex(text);
      expect(result.merchant).not.toMatch(/sales invoice/i);
    });

    it("has reasonable confidence with total and items", () => {
      const result = parseReceiptWithRegex(text);
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    });
  });

  describe("restaurant receipt with discounts", () => {
    const text = `KIWAMI BGC
Unit 1014, 10/16 L2 Lower Ground Floor
Bonifacio High Street Central
Bonifacio Global City, Fort Bonifacio, Taguig City

BILL SLIP
Table No. 33A

03/24/2026                      19:46:25

Coke Zero                       125.00
Oyako Salmon Bock               635.00
Yabu Mozzarella Katsu 3Stks     345.00
Menchi Katsu Set Renov-JPN      445.00
Karaage Tamago                   560.00
Rosu Tomato Omelet Curry        570.00
Akamaru Tamago                   840.00
Kaedama Extra noodles            95.00
Winged Gyoza                    295.00
Extra Miso Soup                 125.00
Kuromitsu Boba Sundae           170.00
Hokkaido Milk w/ Lengua de Gato 150.00

Subtl Amount                  4625.00
Service Charge (10%)            247.77
40% BDO PROMO                (1,850.00)
Total Due                     3022.77`;

    it("extracts total due as the total", () => {
      const result = parseReceiptWithRegex(text);
      expect(result.total_cents).toBe(302277);
    });

    it("extracts multiple line items", () => {
      const result = parseReceiptWithRegex(text);
      expect(result.line_items.length).toBeGreaterThanOrEqual(5);
    });

    it("extracts merchant name", () => {
      const result = parseReceiptWithRegex(text);
      expect(result.merchant).toBe("KIWAMI BGC");
    });

    it("extracts date", () => {
      const result = parseReceiptWithRegex(text);
      expect(result.date).toBe("2026-03-24");
    });
  });

  describe("receipt with no recognizable total", () => {
    const text = `Some Store
Item A    50.00
Item B    75.00
Item C   100.00`;

    it("sums line items as total estimate", () => {
      const result = parseReceiptWithRegex(text);
      expect(result.total_cents).toBe(22500);
    });

    it("still extracts items", () => {
      const result = parseReceiptWithRegex(text);
      expect(result.line_items.length).toBe(3);
    });

    it("has lower confidence than receipt with total", () => {
      const result = parseReceiptWithRegex(text);
      // No explicit total found → confidence should be 0.3 (items only)
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });
  });

  describe("receipt with grand total", () => {
    const text = `Restaurant XYZ
Burger    250.00
Fries     120.00
Subtotal  370.00
VAT        44.40
Grand Total  414.40`;

    it("prefers grand total over subtotal", () => {
      const result = parseReceiptWithRegex(text);
      expect(result.total_cents).toBe(41440);
    });

    it("does not include VAT as line item", () => {
      const result = parseReceiptWithRegex(text);
      const descriptions = result.line_items.map((i) => i.description.toLowerCase());
      expect(descriptions.some((d) => d.includes("vat"))).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns empty result for empty text", () => {
      const result = parseReceiptWithRegex("");
      expect(result.total_cents).toBe(0);
      expect(result.line_items).toEqual([]);
      expect(result.confidence).toBe(0.15);
    });

    it("handles commas in amounts", () => {
      const text = `Store
Product    1,234.56
Total      1,234.56`;
      const result = parseReceiptWithRegex(text);
      expect(result.total_cents).toBe(123456);
    });

    it("handles peso sign in amounts", () => {
      const text = `Store
Coffee  ₱150.00
Total   ₱150.00`;
      const result = parseReceiptWithRegex(text);
      expect(result.total_cents).toBe(15000);
    });

    it("skips change/cash lines for total detection", () => {
      const text = `Store
Item    100.00
Total   100.00
Cash    200.00
Change  100.00`;
      const result = parseReceiptWithRegex(text);
      expect(result.total_cents).toBe(10000);
    });
  });
});
