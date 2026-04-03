import { describe, it, expect } from "vitest";
import { computeGroupInsights } from "../insights-utils";

describe("computeGroupInsights", () => {
  it("returns all zeros for empty expenses", () => {
    const result = computeGroupInsights([]);
    expect(result.total_expenses).toBe(0);
    expect(result.total_amount_cents).toBe(0);
    expect(result.average_expense_cents).toBe(0);
    expect(result.period_days).toBe(0);
    expect(result.top_item).toBeUndefined();
  });

  it("single expense: period_days is 1 (minimum), average equals total", () => {
    const result = computeGroupInsights([
      { item_name: "Lunch", amount_cents: 5000, created_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(result.total_expenses).toBe(1);
    expect(result.total_amount_cents).toBe(5000);
    expect(result.average_expense_cents).toBe(5000);
    expect(result.period_days).toBe(1);
  });

  it("multiple expenses: total and average are correct", () => {
    const result = computeGroupInsights([
      { item_name: "A", amount_cents: 3000, created_at: "2026-01-01T00:00:00Z" },
      { item_name: "B", amount_cents: 4000, created_at: "2026-01-05T00:00:00Z" },
      { item_name: "C", amount_cents: 5000, created_at: "2026-01-10T00:00:00Z" },
    ]);
    expect(result.total_amount_cents).toBe(12000);
    expect(result.average_expense_cents).toBe(4000);
  });

  it("top_item is the most frequent item name", () => {
    const result = computeGroupInsights([
      { item_name: "Lunch", amount_cents: 100, created_at: "2026-01-01T00:00:00Z" },
      { item_name: "Dinner", amount_cents: 100, created_at: "2026-01-02T00:00:00Z" },
      { item_name: "Lunch", amount_cents: 100, created_at: "2026-01-03T00:00:00Z" },
    ]);
    expect(result.top_item).toBe("Lunch");
  });

  it("period_days is the correct day difference between first and last", () => {
    const result = computeGroupInsights([
      { item_name: "A", amount_cents: 100, created_at: "2026-01-01T00:00:00Z" },
      { item_name: "B", amount_cents: 100, created_at: "2026-01-11T00:00:00Z" },
    ]);
    expect(result.period_days).toBe(10);
  });

  it("when all items have the same name, top_item equals that name", () => {
    const result = computeGroupInsights([
      { item_name: "Coffee", amount_cents: 100, created_at: "2026-01-01T00:00:00Z" },
      { item_name: "Coffee", amount_cents: 150, created_at: "2026-01-02T00:00:00Z" },
      { item_name: "Coffee", amount_cents: 120, created_at: "2026-01-03T00:00:00Z" },
    ]);
    expect(result.top_item).toBe("Coffee");
  });
});
