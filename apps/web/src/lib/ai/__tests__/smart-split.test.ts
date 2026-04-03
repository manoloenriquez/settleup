import { describe, it, expect } from "vitest";
import { suggestSplit } from "../smart-split";

// LLM_ENABLED is not set in test env, so always falls back to equal split.

describe("suggestSplit", () => {
  it("returns error when member_names is empty", async () => {
    const result = await suggestSplit({ item_name: "Lunch", amount_cents: 10000, member_names: [], userId: "u1" });
    expect(result.error).toBe("No members to split between");
    expect(result.data).toBeNull();
  });

  it("single member gets the full amount", async () => {
    const result = await suggestSplit({ item_name: "Lunch", amount_cents: 10000, member_names: ["Alice"], userId: "u1" });
    expect(result.data?.suggestions).toHaveLength(1);
    expect(result.data?.suggestions[0]?.share_cents).toBe(10000);
  });

  it("splits 1000 evenly between 2 members", async () => {
    const result = await suggestSplit({ item_name: "Lunch", amount_cents: 1000, member_names: ["A", "B"], userId: "u1" });
    expect(result.data?.mode).toBe("equal");
    expect(result.data?.confidence).toBe(1);
    expect(result.data?.suggestions.map((s) => s.share_cents)).toEqual([500, 500]);
  });

  it("splits 100 among 3 members with correct remainder", async () => {
    const result = await suggestSplit({ item_name: "Snack", amount_cents: 100, member_names: ["A", "B", "C"], userId: "u1" });
    const shares = result.data!.suggestions.map((s) => s.share_cents);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    // equalSplit gives extra cents to first members
    expect(shares[0]).toBe(34);
    expect(shares[1]).toBe(33);
    expect(shares[2]).toBe(33);
  });

  it("suggestion entries have null reason (fallback mode)", async () => {
    const result = await suggestSplit({ item_name: "X", amount_cents: 200, member_names: ["A", "B"], userId: "u1" });
    for (const s of result.data!.suggestions) {
      expect(s.reason).toBeNull();
    }
  });
});
