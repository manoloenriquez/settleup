import { describe, expect, it } from "vitest";
import {
  amountToInput,
  currencySymbol,
  defaultCurrencyForLocale,
  formatAmount,
  isUnusuallyLarge,
  parseAmountInput,
  regionFromLocale,
} from "../utils/amount";

describe("parseAmountInput", () => {
  it("reads decimals with either mark", () => {
    expect(parseAmountInput("12.50", "PHP")).toBe(1250);
    expect(parseAmountInput("12,5", "EUR")).toBe(1250);
    expect(parseAmountInput("0.99", "USD")).toBe(99);
    expect(parseAmountInput(".5", "USD")).toBe(50);
  });

  it("reads thousands grouping", () => {
    expect(parseAmountInput("1,500", "PHP")).toBe(150000);
    expect(parseAmountInput("1.500,00", "EUR")).toBe(150000);
    expect(parseAmountInput("1.500", "EUR")).toBeNull();
    expect(parseAmountInput("1,234,567.89", "USD")).toBe(123456789);
    expect(parseAmountInput("1.234.567,89", "EUR")).toBe(123456789);
    expect(parseAmountInput("₱ 2,000", "PHP")).toBe(200000);
    expect(parseAmountInput("PHP 2000", "PHP")).toBe(200000);
  });

  it("respects each currency's precision", () => {
    expect(parseAmountInput("1500", "JPY")).toBe(1500);
    expect(parseAmountInput("1,500", "JPY")).toBe(1500);
    expect(parseAmountInput("15.5", "JPY")).toBeNull();
    expect(parseAmountInput("1.234", "KWD")).toBe(1234);
    expect(parseAmountInput("10.005", "USD")).toBeNull();
    expect(parseAmountInput("0.005", "USD")).toBeNull();
  });

  it("rejects zero, negatives and garbage", () => {
    for (const bad of ["", "0", "0.00", "-5", "−5", "abc", "12abc5", "1.2.3", "1,50,0", ","]) {
      expect(parseAmountInput(bad, "PHP")).toBeNull();
    }
  });

  it("round-trips with amountToInput", () => {
    for (const [minor, code] of [[1, "PHP"], [100, "USD"], [123456, "PHP"], [1500, "JPY"], [1234, "KWD"]] as const) {
      expect(parseAmountInput(amountToInput(minor, code), code)).toBe(minor);
    }
  });
});

describe("formatAmount", () => {
  it("uses the currency's own decimals", () => {
    expect(formatAmount(123456, "PHP", "en-US")).toBe("₱1,234.56");
    expect(formatAmount(1500, "JPY", "en-US")).toBe("¥1,500");
    expect(formatAmount(1200, "USD", "en-US")).toBe("$12.00");
    expect(formatAmount(1234, "KWD", "en-US")).toContain("1.234");
    expect(formatAmount(-500, "PHP", "en-US")).toBe("-₱5.00");
  });
});

describe("currencySymbol", () => {
  it("returns the display symbol without digits", () => {
    expect(currencySymbol("PHP", "en-US")).toBe("₱");
    expect(currencySymbol("JPY", "en-US")).toBe("¥");
    expect(currencySymbol("CHF", "en-US")).toBe("CHF");
    expect(currencySymbol("EUR", "de-DE")).toBe("€");
  });
});

describe("isUnusuallyLarge", () => {
  it("scales the threshold for zero-decimal currencies", () => {
    expect(isUnusuallyLarge(99_999_999, "PHP")).toBe(false);
    expect(isUnusuallyLarge(100_000_000, "PHP")).toBe(true);
    expect(isUnusuallyLarge(1_000_000, "JPY")).toBe(false);
    expect(isUnusuallyLarge(100_000_000, "JPY")).toBe(true);
  });
});

describe("defaultCurrencyForLocale", () => {
  it("maps the region and falls back to PHP", () => {
    expect(regionFromLocale("zh-Hant-TW")).toBe("TW");
    expect(defaultCurrencyForLocale("en-PH")).toBe("PHP");
    expect(defaultCurrencyForLocale("en_US")).toBe("USD");
    expect(defaultCurrencyForLocale("ja-JP")).toBe("JPY");
    expect(defaultCurrencyForLocale("de-DE")).toBe("EUR");
    expect(defaultCurrencyForLocale("en")).toBe("PHP");
    expect(defaultCurrencyForLocale(null)).toBe("PHP");
  });
});
