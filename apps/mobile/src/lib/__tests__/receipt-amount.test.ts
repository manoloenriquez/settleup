import { describe, expect, it } from "vitest";
import { receiptCentsFromText, receiptTextFromCents } from "../receipt-amount";

describe("receipt line amounts", () => {
  it("accepts every intermediate value while typing 24.50", () => {
    const typed = ["2", "24", "24.", "24.5", "24.50"].map(receiptCentsFromText);
    expect(typed[0]).toBe(200);
    expect(typed[1]).toBe(2400);
    expect(typed[3]).toBe(2450);
    expect(typed[4]).toBe(2450);
  });

  it("treats an emptied field as zero and keeps grouping", () => {
    expect(receiptCentsFromText("")).toBe(0);
    expect(receiptCentsFromText("1,240")).toBe(124000);
  });

  it("rejects a third decimal instead of clearing the field", () => {
    expect(receiptCentsFromText("12.505")).toBeNull();
  });

  it("formats on blur", () => {
    expect(receiptTextFromCents(2450)).toBe("24.50");
    expect(receiptTextFromCents(0)).toBe("");
  });
});
