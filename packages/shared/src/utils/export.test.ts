import { describe, expect, it } from "vitest";
import { buildGroupLedgerCsv } from "./export";

describe("buildGroupLedgerCsv", () => {
  it("produces a header and sorted rows", () => {
    const csv = buildGroupLedgerCsv(
      [
        {
          item_name: "Dinner",
          amount_cents: 271700,
          created_at: "2026-06-02T10:00:00Z",
          payer_names: ["Ana"],
          participant_names: ["Ana", "Ben"],
          category_name: "Food & Drinks",
        },
      ],
      [
        {
          from_name: "Ben",
          to_name: "Ana",
          amount_cents: 135850,
          created_at: "2026-06-01T08:00:00Z",
          status: "PAID",
        },
      ],
    );

    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("type,date,description,category,amount_php,paid_by,split_with,status,notes");
    // payment (June 1) sorts before expense (June 2)
    expect(lines[1]).toBe("payment,2026-06-01,Ben paid Ana,,1358.50,Ben,Ana,PAID,");
    expect(lines[2]).toBe("expense,2026-06-02,Dinner,Food & Drinks,2717.00,Ana,Ana; Ben,,");
  });

  it("escapes commas and quotes in fields", () => {
    const csv = buildGroupLedgerCsv(
      [
        {
          item_name: 'Snacks, drinks "extra"',
          amount_cents: 100,
          created_at: "2026-06-02T10:00:00Z",
          payer_names: ["Ana"],
          participant_names: ["Ana"],
        },
      ],
      [],
    );
    expect(csv).toContain('"Snacks, drinks ""extra"""');
  });

  it("handles empty inputs", () => {
    const csv = buildGroupLedgerCsv([], []);
    expect(csv.trim().split("\n")).toHaveLength(1);
  });
});
