import { describe, it, expect } from "vitest";
import { mergeAndSortActivity } from "../activity-utils";

describe("mergeAndSortActivity", () => {
  it("returns empty array for empty inputs", () => {
    expect(mergeAndSortActivity([], [])).toEqual([]);
  });

  it("maps expenses to ActivityItem with type 'expense' and label = item_name", () => {
    const result = mergeAndSortActivity(
      [{ id: "e1", item_name: "Lunch", amount_cents: 5000, created_at: "2026-01-01T12:00:00Z" }],
      [],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "e1", type: "expense", label: "Lunch", amount_cents: 5000 });
  });

  it("maps payments to ActivityItem with type 'payment' and label 'Payment recorded'", () => {
    const result = mergeAndSortActivity(
      [],
      [{ id: "p1", amount_cents: 2000, created_at: "2026-01-01T12:00:00Z" }],
    );
    expect(result[0]).toMatchObject({ id: "p1", type: "payment", label: "Payment recorded", amount_cents: 2000 });
  });

  it("sorts mixed items by date descending (newest first)", () => {
    const result = mergeAndSortActivity(
      [{ id: "e1", item_name: "Old expense", amount_cents: 100, created_at: "2026-01-01T00:00:00Z" }],
      [{ id: "p1", amount_cents: 200, created_at: "2026-03-01T00:00:00Z" }],
    );
    expect(result[0]?.id).toBe("p1");
    expect(result[1]?.id).toBe("e1");
  });

  it("limits output to 30 items when given 40 inputs", () => {
    const expenses = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`,
      item_name: "X",
      amount_cents: 100,
      created_at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    const payments = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      amount_cents: 100,
      created_at: `2026-02-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    const result = mergeAndSortActivity(expenses, payments);
    expect(result).toHaveLength(30);
  });

  it("includes both items when they share the same timestamp", () => {
    const ts = "2026-01-01T12:00:00Z";
    const result = mergeAndSortActivity(
      [{ id: "e1", item_name: "X", amount_cents: 100, created_at: ts }],
      [{ id: "p1", amount_cents: 200, created_at: ts }],
    );
    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.id);
    expect(ids).toContain("e1");
    expect(ids).toContain("p1");
  });
});
