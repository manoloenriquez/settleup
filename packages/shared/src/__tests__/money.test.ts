import { describe, it, expect } from "vitest";
import { formatCents, parsePHPAmount } from "../utils/money";

describe("formatCents", () => {
  it("formats zero", () => {
    expect(formatCents(0)).toBe("₱0.00");
  });

  it("formats a round amount", () => {
    expect(formatCents(100000)).toBe("₱1,000.00");
  });

  it("formats with decimals", () => {
    expect(formatCents(870339)).toBe("₱8,703.39");
  });

  it("formats single digit cents", () => {
    expect(formatCents(101)).toBe("₱1.01");
  });

  it("formats negative amounts with sign before symbol", () => {
    expect(formatCents(-123456)).toBe("-₱1,234.56");
  });
});

describe("parsePHPAmount", () => {
  it("parses a plain number", () => {
    expect(parsePHPAmount("8703.39")).toBe(870339);
  });

  it("strips peso sign", () => {
    expect(parsePHPAmount("₱1,234.56")).toBe(123456);
  });

  it("strips commas", () => {
    expect(parsePHPAmount("1,000.00")).toBe(100000);
  });

  it("parses a round number", () => {
    expect(parsePHPAmount("2717")).toBe(271700);
  });

  it("returns null for empty string", () => {
    expect(parsePHPAmount("")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parsePHPAmount("abc")).toBeNull();
  });

  it("parses negative values", () => {
    expect(parsePHPAmount("-100")).toBe(-10000);
  });

  it("parses a negative PHP amount", () => {
    expect(parsePHPAmount("-8703.39")).toBe(-870339);
  });

  it("returns null for zero", () => {
    expect(parsePHPAmount("0")).toBeNull();
  });
});
