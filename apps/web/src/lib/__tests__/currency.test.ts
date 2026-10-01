import { describe, expect, it } from "vitest";
import {
  currencyOrPhp,
  defaultFirst,
  formatCurrency,
  formatTotalsByCurrency,
  hundredthsToInput,
  parseCurrencyCodes,
} from "../currency";

describe("web currency helpers", () => {
  it("validates currency lists and puts the group default first", () => {
    expect(parseCurrencyCodes(["USD", "PHP"], ["PHP"])).toEqual(["USD", "PHP"]);
    expect(parseCurrencyCodes(["XXX"], ["PHP"])).toEqual(["PHP"]);
    expect(parseCurrencyCodes([], [])).toEqual([]);
    expect(defaultFirst(["EUR", "JPY", "USD"], "JPY")).toEqual(["JPY", "EUR", "USD"]);
    expect(defaultFirst(["EUR"], "PHP")).toEqual(["PHP", "EUR"]);
  });

  it("treats missing or unknown stored currencies as pesos", () => {
    expect(currencyOrPhp(undefined)).toBe("PHP");
    expect(currencyOrPhp("nope")).toBe("PHP");
    expect(currencyOrPhp("JPY")).toBe("JPY");
  });

  it("keeps totals per currency instead of adding them together", () => {
    const text = formatTotalsByCurrency([
      { amount_cents: 1000, currency_code: "PHP" },
      { amount_cents: 500, currency_code: "JPY" },
      { amount_cents: 250, currency_code: "PHP" },
    ]);
    expect(text).toBe(`${formatCurrency(1250, "PHP")} · ${formatCurrency(500, "JPY")}`);
  });

  it("rounds computed fractional amounts before formatting", () => {
    expect(formatCurrency(333.33, "PHP")).toBe(formatCurrency(333, "PHP"));
  });

  it("reads AI hundredths as input text in the chosen currency", () => {
    expect(hundredthsToInput(1001, "PHP")).toBe("10.01");
    expect(hundredthsToInput(100000, "JPY")).toBe("1000");
    expect(hundredthsToInput(1050, "JPY")).toBe("10.50");
    expect(hundredthsToInput(1250, "KWD")).toBe("12.500");
  });
});
