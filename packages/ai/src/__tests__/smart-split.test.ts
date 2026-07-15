import { describe, it, expect } from "vitest";
import { suggestSplit, isValidSmartSplit } from "../features/smart-split";

// LLM_ENABLED is not set in test env, so always falls back to equal split.

describe("suggestSplit", () => {
  it("returns error when member_names is empty", async () => {
    const result = await suggestSplit({ item_name: "Lunch", amount_cents: 10000, member_names: [] });
    expect(result.error).toBe("No members to split between");
    expect(result.data).toBeNull();
  });

  it("single member gets the full amount", async () => {
    const result = await suggestSplit({ item_name: "Lunch", amount_cents: 10000, member_names: ["Alice"] });
    expect(result.data?.suggestions).toHaveLength(1);
    expect(result.data?.suggestions[0]?.share_cents).toBe(10000);
  });

  it("splits 1000 evenly between 2 members", async () => {
    const result = await suggestSplit({ item_name: "Lunch", amount_cents: 1000, member_names: ["A", "B"] });
    expect(result.data?.mode).toBe("equal");
    expect(result.data?.confidence).toBe(1);
    expect(result.data?.suggestions.map((s) => s.share_cents)).toEqual([500, 500]);
  });

  it("splits 100 among 3 members with correct remainder", async () => {
    const result = await suggestSplit({ item_name: "Snack", amount_cents: 100, member_names: ["A", "B", "C"] });
    const shares = result.data!.suggestions.map((s) => s.share_cents);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(shares[0]).toBe(34);
    expect(shares[1]).toBe(33);
    expect(shares[2]).toBe(33);
  });

  it("suggestion entries have null reason (fallback mode)", async () => {
    const result = await suggestSplit({ item_name: "X", amount_cents: 200, member_names: ["A", "B"] });
    for (const s of result.data!.suggestions) {
      expect(s.reason).toBeNull();
    }
  });
});

describe("isValidSmartSplit", () => {
  const members = ["Alice", "Bob"];
  const suggestion = (member_name: string, share_cents: number) => ({ member_name, share_cents, reason: null });
  const result = (suggestions: { member_name: string; share_cents: number; reason: string | null }[]) => ({
    mode: "custom" as const,
    suggestions,
    explanation: null,
    confidence: 0.9,
  });

  it("accepts shares that sum to the total for known members", () => {
    expect(isValidSmartSplit(result([suggestion("Alice", 6000), suggestion("Bob", 4000)]), 10000, members)).toBe(true);
  });

  it("rejects shares that do not sum to the total", () => {
    expect(isValidSmartSplit(result([suggestion("Alice", 6000), suggestion("Bob", 5000)]), 10000, members)).toBe(false);
  });

  it("rejects unknown member names", () => {
    expect(isValidSmartSplit(result([suggestion("Alice", 6000), suggestion("Eve", 4000)]), 10000, members)).toBe(false);
  });

  it("rejects empty suggestions", () => {
    expect(isValidSmartSplit(result([]), 10000, members)).toBe(false);
  });
});
