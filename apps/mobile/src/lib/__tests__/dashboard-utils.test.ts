import { describe, it, expect } from "vitest";
import { aggregateBalances } from "../dashboard-utils";

describe("aggregateBalances", () => {
  it("returns all zeros for empty balances", () => {
    const result = aggregateBalances([]);
    expect(result.total_owed_cents).toBe(0);
    expect(result.total_receivable_cents).toBe(0);
    expect(result.net_cents).toBe(0);
  });

  it("all positive: receivable = sum, owed = 0", () => {
    const result = aggregateBalances([{ net_cents: 1000 }, { net_cents: 2000 }]);
    expect(result.total_receivable_cents).toBe(3000);
    expect(result.total_owed_cents).toBe(0);
  });

  it("all negative: owed = sum of abs values, receivable = 0", () => {
    const result = aggregateBalances([{ net_cents: -500 }, { net_cents: -1500 }]);
    expect(result.total_owed_cents).toBe(2000);
    expect(result.total_receivable_cents).toBe(0);
  });

  it("mixed positive and negative: splits correctly", () => {
    const result = aggregateBalances([{ net_cents: 3000 }, { net_cents: -1000 }, { net_cents: 500 }]);
    expect(result.total_receivable_cents).toBe(3500);
    expect(result.total_owed_cents).toBe(1000);
  });

  it("single zero entry: all zeros", () => {
    const result = aggregateBalances([{ net_cents: 0 }]);
    expect(result.total_owed_cents).toBe(0);
    expect(result.total_receivable_cents).toBe(0);
    expect(result.net_cents).toBe(0);
  });

  it("net = receivable - owed invariant holds", () => {
    const result = aggregateBalances([{ net_cents: 4000 }, { net_cents: -1500 }]);
    expect(result.net_cents).toBe(result.total_receivable_cents - result.total_owed_cents);
  });
});
