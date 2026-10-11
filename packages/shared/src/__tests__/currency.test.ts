import { simplifyDebts, computePairwiseDebts } from "../utils/debts";
import { describe, expect, it } from "vitest";
import { parseMoneyAmount, formatMoney, minorToDecimal, sumMoney } from "../utils/currency";

describe("currency-coded integer money", () => {
  it("preserves PHP values exactly and supports zero and three decimal currencies", () => {
    expect(parseMoneyAmount("1234.56", "PHP")).toBe(123456);
    expect(parseMoneyAmount("1234", "JPY")).toBe(1234);
    expect(parseMoneyAmount("1.234", "KWD")).toBe(1234);
    expect(parseMoneyAmount("1.5", "JPY")).toBeNull();
    expect(parseMoneyAmount("1.2345", "KWD")).toBeNull();
    expect(parseMoneyAmount("-12.34", "USD")).toBe(-1234);
  });
  it("accepts locale-specific decimal marks and digits", () => {
    expect(parseMoneyAmount("1.234,56", "EUR", "de-DE")).toBe(123456);
    expect(parseMoneyAmount("1\u202f234,56", "EUR", "fr-FR")).toBe(123456);
    expect(parseMoneyAmount("١٢٫٣٤", "SAR", "ar-SA")).toBe(1234);
    expect(parseMoneyAmount("12,34,567.89", "INR", "en-IN")).toBe(123456789);
  });
  it("rejects malformed, non-finite and unsafe amounts", () => {
    for (const input of [
      "1e3",
      "Infinity",
      "1.23x",
      "1.234",
      "0",
      "9007199254740992",
      "--1",
      "1,50",
      "1 50",
      "1.2,3",
      "12,34,567",
    ])
      expect(parseMoneyAmount(input, "PHP")).toBeNull();
  });
  it("roundtrips exact decimals and labels currencies explicitly", () => {
    expect(formatMoney(Number.MAX_SAFE_INTEGER, "PHP", "en-US")).toBe(
      "PHP\u00a090,071,992,547,409.91",
    );
    expect(formatMoney(-1, "USD", "en-US")).toBe("-USD\u00a00.01");
    expect(minorToDecimal(1, "KWD")).toBe("0.001");
    expect(minorToDecimal(-12, "JPY")).toBe("-12");
    expect(formatMoney(1200, "JPY", "en-US")).toBe("JPY\u00a01,200");
  });
  it("never combines unlike currencies", () => {
    expect(
      sumMoney([
        { currency_code: "PHP", amount_minor: 100 },
        { currency_code: "USD", amount_minor: 100 },
        { currency_code: "PHP", amount_minor: -25 },
      ]),
    ).toEqual([
      { currency_code: "PHP", amount_minor: 75 },
      { currency_code: "USD", amount_minor: 100 },
    ]);
  });
});

describe("currency-safe debt simplification", () => {
  it("rejects a mixed currency net instead of suggesting a cross-currency transfer", () => {
    expect(() =>
      simplifyDebts([
        { member_id: "a", display_name: "A", net_cents: 100, currency_code: "USD" },
        { member_id: "b", display_name: "B", net_cents: -100, currency_code: "PHP" },
      ]),
    ).toThrow("separately");
    expect(() =>
      computePairwiseDebts(
        [
          { currency_code: "USD", participants: [] },
          { currency_code: "PHP", participants: [] },
        ],
        [],
      ),
    ).toThrow("separately");
  });
  it("carries the currency through a suggested transfer", () => {
    expect(
      simplifyDebts([
        { member_id: "a", display_name: "A", net_cents: 1234, currency_code: "KWD" },
        { member_id: "b", display_name: "B", net_cents: -1234, currency_code: "KWD" },
      ])[0],
    ).toMatchObject({ amount_cents: 1234, currency_code: "KWD" });
  });
});
