import { describe, it, expect } from "vitest";
import { computeInsights } from "../features/insights";

describe("computeInsights", () => {
  it("returns all zeros/nulls for empty expenses", () => {
    const result = computeInsights([]);
    expect(result.total_expenses).toBe(0);
    expect(result.total_amount_cents).toBe(0);
    expect(result.average_expense_cents).toBe(0);
    expect(result.top_spender).toBeNull();
    expect(result.most_common_item).toBeNull();
    expect(result.period).toBeNull();
  });

  it("handles single expense, single payer", () => {
    const result = computeInsights(
      [{ item_name: "Lunch", amount_cents: 50000, created_at: "2026-01-01", payer_names: ["Alice"] }],
    );
    expect(result.total_expenses).toBe(1);
    expect(result.total_amount_cents).toBe(50000);
    expect(result.average_expense_cents).toBe(50000);
    expect(result.top_spender).toEqual({ name: "Alice", amount_cents: 50000 });
  });

  it("picks top spender with highest cumulative total across multiple expenses", () => {
    const result = computeInsights(
      [
        { item_name: "A", amount_cents: 10000, created_at: "2026-01-01", payer_names: ["Bob"] },
        { item_name: "B", amount_cents: 30000, created_at: "2026-01-02", payer_names: ["Alice"] },
        { item_name: "C", amount_cents: 5000, created_at: "2026-01-03", payer_names: ["Bob"] },
      ],
    );
    expect(result.top_spender?.name).toBe("Alice");
    expect(result.top_spender?.amount_cents).toBe(30000);
  });

  it("credits each payer with full expense amount on multi-payer expense", () => {
    const result = computeInsights(
      [{ item_name: "Dinner", amount_cents: 20000, created_at: "2026-01-01", payer_names: ["A", "B"] }],
    );
    expect(result.top_spender?.amount_cents).toBe(20000);
  });

  it("most_common_item is null when all item names are unique", () => {
    const result = computeInsights(
      [
        { item_name: "Lunch", amount_cents: 100, created_at: "2026-01-01", payer_names: ["A"] },
        { item_name: "Dinner", amount_cents: 100, created_at: "2026-01-02", payer_names: ["A"] },
      ],
    );
    expect(result.most_common_item).toBeNull();
  });

  it("counts item names case-insensitively", () => {
    const result = computeInsights(
      [
        { item_name: "Lunch", amount_cents: 100, created_at: "2026-01-01", payer_names: ["A"] },
        { item_name: "lunch", amount_cents: 100, created_at: "2026-01-02", payer_names: ["A"] },
      ],
    );
    expect(result.most_common_item?.name).toBe("lunch");
    expect(result.most_common_item?.count).toBe(2);
  });

  it("most_common_item picks the highest-count item", () => {
    const result = computeInsights(
      [
        { item_name: "Lunch", amount_cents: 100, created_at: "2026-01-01", payer_names: ["A"] },
        { item_name: "Lunch", amount_cents: 100, created_at: "2026-01-02", payer_names: ["A"] },
        { item_name: "Lunch", amount_cents: 100, created_at: "2026-01-03", payer_names: ["A"] },
        { item_name: "Dinner", amount_cents: 100, created_at: "2026-01-04", payer_names: ["A"] },
        { item_name: "Dinner", amount_cents: 100, created_at: "2026-01-05", payer_names: ["A"] },
      ],
    );
    expect(result.most_common_item?.name).toBe("lunch");
    expect(result.most_common_item?.count).toBe(3);
  });

  it("period.first and last are sorted correctly across multiple dates", () => {
    const result = computeInsights(
      [
        { item_name: "A", amount_cents: 100, created_at: "2026-03-01", payer_names: ["A"] },
        { item_name: "B", amount_cents: 100, created_at: "2026-01-15", payer_names: ["A"] },
        { item_name: "C", amount_cents: 100, created_at: "2026-06-20", payer_names: ["A"] },
      ],
    );
    expect(result.period?.first_expense).toBe("2026-01-15");
    expect(result.period?.last_expense).toBe("2026-06-20");
  });

  it("period.first === last for a single expense", () => {
    const result = computeInsights(
      [{ item_name: "A", amount_cents: 100, created_at: "2026-05-10", payer_names: ["A"] }],
    );
    expect(result.period?.first_expense).toBe("2026-05-10");
    expect(result.period?.last_expense).toBe("2026-05-10");
  });

  it("average rounds correctly", () => {
    const result = computeInsights(
      [
        { item_name: "A", amount_cents: 870339, created_at: "2026-01-01", payer_names: ["A"] },
        { item_name: "B", amount_cents: 870339, created_at: "2026-01-02", payer_names: ["A"] },
        { item_name: "C", amount_cents: 870339, created_at: "2026-01-03", payer_names: ["A"] },
      ],
    );
    expect(result.average_expense_cents).toBe(870339);
    expect(result.total_amount_cents).toBe(2611017);
  });
});
