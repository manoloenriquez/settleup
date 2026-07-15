import { describe, it, expect } from "vitest";
import {
  addExpenseSchema,
  addExpensesBatchSchema,
  addItemizedExpenseSchema,
  recordPaymentSchema,
  createGroupSchema,
  addMemberSchema,
  dashboardSummarySchema,
} from "../schemas";
import { parsedReceiptSchema, expenseDraftSchema } from "../schemas/ai";

// Valid v4 UUIDs (version=4, variant=8)
const GROUP_ID = "f47ac10b-58cc-4372-8567-0e02b2c3d479";
const MEMBER_A = "a47ac10b-58cc-4372-8567-0e02b2c3d401";
const MEMBER_B = "b47ac10b-58cc-4372-8567-0e02b2c3d402";
const MEMBER_C = "c47ac10b-58cc-4372-8567-0e02b2c3d403";

// ---------------------------------------------------------------------------
// addExpenseSchema
// ---------------------------------------------------------------------------

describe("addExpenseSchema", () => {
  it("accepts a valid equal-split expense", () => {
    const result = addExpenseSchema.safeParse({
      group_id: GROUP_ID,
      item_name: "Lunch",
      amount_cents: 3000,
      participant_ids: [MEMBER_A, MEMBER_B],
      payers: [{ member_id: MEMBER_A, paid_cents: 3000 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero amount", () => {
    const result = addExpenseSchema.safeParse({
      group_id: GROUP_ID,
      item_name: "Lunch",
      amount_cents: 0,
      participant_ids: [MEMBER_A],
      payers: [{ member_id: MEMBER_A, paid_cents: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty item_name", () => {
    const result = addExpenseSchema.safeParse({
      group_id: GROUP_ID,
      item_name: "  ",
      amount_cents: 1000,
      participant_ids: [MEMBER_A],
      payers: [{ member_id: MEMBER_A, paid_cents: 1000 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects when payer sum < amount", () => {
    const result = addExpenseSchema.safeParse({
      group_id: GROUP_ID,
      item_name: "Dinner",
      amount_cents: 5000,
      participant_ids: [MEMBER_A, MEMBER_B],
      payers: [{ member_id: MEMBER_A, paid_cents: 4000 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/payer/i);
    }
  });

  it("rejects when payer sum > amount", () => {
    const result = addExpenseSchema.safeParse({
      group_id: GROUP_ID,
      item_name: "Dinner",
      amount_cents: 5000,
      participant_ids: [MEMBER_A],
      payers: [{ member_id: MEMBER_A, paid_cents: 6000 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts multi-payer where sum matches", () => {
    const result = addExpenseSchema.safeParse({
      group_id: GROUP_ID,
      item_name: "Party",
      amount_cents: 10000,
      participant_ids: [MEMBER_A, MEMBER_B, MEMBER_C],
      payers: [
        { member_id: MEMBER_A, paid_cents: 6000 },
        { member_id: MEMBER_B, paid_cents: 4000 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty participant_ids", () => {
    const result = addExpenseSchema.safeParse({
      group_id: GROUP_ID,
      item_name: "Lunch",
      amount_cents: 1000,
      participant_ids: [],
      payers: [{ member_id: MEMBER_A, paid_cents: 1000 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty payers", () => {
    const result = addExpenseSchema.safeParse({
      group_id: GROUP_ID,
      item_name: "Lunch",
      amount_cents: 1000,
      participant_ids: [MEMBER_A],
      payers: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive payer amount", () => {
    const result = addExpenseSchema.safeParse({
      group_id: GROUP_ID,
      item_name: "Lunch",
      amount_cents: 1000,
      participant_ids: [MEMBER_A],
      payers: [{ member_id: MEMBER_A, paid_cents: -500 }],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addExpensesBatchSchema
// ---------------------------------------------------------------------------

describe("addExpensesBatchSchema", () => {
  it("accepts a valid batch with equal splits", () => {
    const result = addExpensesBatchSchema.safeParse({
      group_id: GROUP_ID,
      items: [
        {
          item_name: "Coffee",
          amount_cents: 500,
          split_mode: "equal",
          participant_ids: [MEMBER_A],
          payers: [{ member_id: MEMBER_A, paid_cents: 500 }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid batch with custom splits", () => {
    const result = addExpensesBatchSchema.safeParse({
      group_id: GROUP_ID,
      items: [
        {
          item_name: "Taxi",
          amount_cents: 300,
          split_mode: "custom",
          participant_ids: [MEMBER_A, MEMBER_B],
          custom_splits: [
            { member_id: MEMBER_A, share_cents: 200 },
            { member_id: MEMBER_B, share_cents: 100 },
          ],
          payers: [{ member_id: MEMBER_A, paid_cents: 300 }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects custom split where sum mismatches", () => {
    const result = addExpensesBatchSchema.safeParse({
      group_id: GROUP_ID,
      items: [
        {
          item_name: "Taxi",
          amount_cents: 300,
          split_mode: "custom",
          participant_ids: [MEMBER_A, MEMBER_B],
          custom_splits: [
            { member_id: MEMBER_A, share_cents: 100 },
            { member_id: MEMBER_B, share_cents: 100 },
          ],
          payers: [{ member_id: MEMBER_A, paid_cents: 300 }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects payer sum mismatch within a batch item", () => {
    const result = addExpensesBatchSchema.safeParse({
      group_id: GROUP_ID,
      items: [
        {
          item_name: "Coffee",
          amount_cents: 500,
          split_mode: "equal",
          participant_ids: [MEMBER_A],
          payers: [{ member_id: MEMBER_A, paid_cents: 400 }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty items array", () => {
    const result = addExpensesBatchSchema.safeParse({
      group_id: GROUP_ID,
      items: [],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addItemizedExpenseSchema
// ---------------------------------------------------------------------------

describe("addItemizedExpenseSchema", () => {
  it("accepts a valid itemized expense", () => {
    const result = addItemizedExpenseSchema.safeParse({
      group_id: GROUP_ID,
      item_name: "Restaurant",
      amount_cents: 2000,
      payers: [{ member_id: MEMBER_A, paid_cents: 2000 }],
      line_items: [
        { name: "Pasta", amount_cents: 1200, participant_ids: [MEMBER_A] },
        { name: "Salad", amount_cents: 800, participant_ids: [MEMBER_B] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects when line items sum < expense amount", () => {
    const result = addItemizedExpenseSchema.safeParse({
      group_id: GROUP_ID,
      item_name: "Restaurant",
      amount_cents: 2000,
      payers: [{ member_id: MEMBER_A, paid_cents: 2000 }],
      line_items: [
        { name: "Pasta", amount_cents: 1000, participant_ids: [MEMBER_A] },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/line items/i);
    }
  });

  it("rejects when line items sum > expense amount", () => {
    const result = addItemizedExpenseSchema.safeParse({
      group_id: GROUP_ID,
      item_name: "Restaurant",
      amount_cents: 2000,
      payers: [{ member_id: MEMBER_A, paid_cents: 2000 }],
      line_items: [
        { name: "Pasta", amount_cents: 2500, participant_ids: [MEMBER_A] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects payer sum mismatch", () => {
    const result = addItemizedExpenseSchema.safeParse({
      group_id: GROUP_ID,
      item_name: "Restaurant",
      amount_cents: 2000,
      payers: [{ member_id: MEMBER_A, paid_cents: 1500 }],
      line_items: [
        { name: "Pasta", amount_cents: 1200, participant_ids: [MEMBER_A] },
        { name: "Salad", amount_cents: 800, participant_ids: [MEMBER_B] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty line_items", () => {
    const result = addItemizedExpenseSchema.safeParse({
      group_id: GROUP_ID,
      item_name: "Restaurant",
      amount_cents: 1000,
      payers: [{ member_id: MEMBER_A, paid_cents: 1000 }],
      line_items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects line item with zero amount", () => {
    const result = addItemizedExpenseSchema.safeParse({
      group_id: GROUP_ID,
      item_name: "Restaurant",
      amount_cents: 1000,
      payers: [{ member_id: MEMBER_A, paid_cents: 1000 }],
      line_items: [
        { name: "Free thing", amount_cents: 0, participant_ids: [MEMBER_A] },
        { name: "Paid thing", amount_cents: 1000, participant_ids: [MEMBER_A] },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("dashboardSummarySchema", () => {
  it("accepts a valid dashboard summary payload", () => {
    const result = dashboardSummarySchema.safeParse({
      net_balance_cents: -1250,
      total_groups: 2,
      total_unsettled_cents: 4300,
      pending_members: 3,
      groups: [
        {
          id: GROUP_ID,
          name: "Trip",
          member_count: 4,
          pending_count: 2,
          total_owed_cents: 4300,
          created_at: "2026-04-06T00:00:00.000Z",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("defaults v2 fields when parsing a v1 payload", () => {
    const result = dashboardSummarySchema.safeParse({
      net_balance_cents: 500,
      total_groups: 1,
      total_unsettled_cents: 500,
      pending_members: 1,
      groups: [
        {
          id: GROUP_ID,
          name: "Trip",
          member_count: 2,
          pending_count: 1,
          total_owed_cents: 500,
          created_at: "2026-04-06T00:00:00.000Z",
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.owed_to_me_cents).toBe(0);
      expect(result.data.i_owe_cents).toBe(0);
      expect(result.data.owed_counterparty_count).toBe(0);
      expect(result.data.owe_counterparty_count).toBe(0);
      expect(result.data.groups[0]?.my_net_cents).toBe(0);
    }
  });

  it("accepts v2 fields when present", () => {
    const result = dashboardSummarySchema.safeParse({
      net_balance_cents: 500,
      total_groups: 1,
      total_unsettled_cents: 500,
      pending_members: 1,
      owed_to_me_cents: 800,
      i_owe_cents: 300,
      owed_counterparty_count: 2,
      owe_counterparty_count: 1,
      groups: [
        {
          id: GROUP_ID,
          name: "Trip",
          member_count: 2,
          pending_count: 1,
          total_owed_cents: 500,
          my_net_cents: -300,
          created_at: "2026-04-06T00:00:00.000Z",
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.owed_to_me_cents).toBe(800);
      expect(result.data.groups[0]?.my_net_cents).toBe(-300);
    }
  });

  it("rejects groups with invalid IDs", () => {
    const result = dashboardSummarySchema.safeParse({
      net_balance_cents: 0,
      total_groups: 1,
      total_unsettled_cents: 0,
      pending_members: 0,
      groups: [
        {
          id: "not-a-uuid",
          name: "Trip",
          member_count: 1,
          pending_count: 0,
          total_owed_cents: 0,
          created_at: "2026-04-06T00:00:00.000Z",
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recordPaymentSchema
// ---------------------------------------------------------------------------

describe("recordPaymentSchema", () => {
  it("accepts a valid payment", () => {
    const result = recordPaymentSchema.safeParse({
      group_id: GROUP_ID,
      from_member_id: MEMBER_A,
      to_member_id: MEMBER_B,
      amount_cents: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects self-payment", () => {
    const result = recordPaymentSchema.safeParse({
      group_id: GROUP_ID,
      from_member_id: MEMBER_A,
      to_member_id: MEMBER_A,
      amount_cents: 5000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => /yourself/i.test(m))).toBe(true);
    }
  });

  it("rejects zero amount", () => {
    const result = recordPaymentSchema.safeParse({
      group_id: GROUP_ID,
      from_member_id: MEMBER_A,
      to_member_id: MEMBER_B,
      amount_cents: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = recordPaymentSchema.safeParse({
      group_id: GROUP_ID,
      from_member_id: MEMBER_A,
      to_member_id: MEMBER_B,
      amount_cents: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing from_member_id", () => {
    const result = recordPaymentSchema.safeParse({
      group_id: GROUP_ID,
      to_member_id: MEMBER_B,
      amount_cents: 1000,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createGroupSchema
// ---------------------------------------------------------------------------

describe("createGroupSchema", () => {
  it("accepts a valid group name", () => {
    const result = createGroupSchema.safeParse({ name: "Summer Trip" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createGroupSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 characters", () => {
    const result = createGroupSchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("trims whitespace", () => {
    const result = createGroupSchema.safeParse({ name: "  Trip  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Trip");
    }
  });
});

// ---------------------------------------------------------------------------
// addMemberSchema
// ---------------------------------------------------------------------------

describe("addMemberSchema", () => {
  it("accepts a valid member", () => {
    const result = addMemberSchema.safeParse({
      group_id: GROUP_ID,
      display_name: "Alice",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty display_name", () => {
    const result = addMemberSchema.safeParse({
      group_id: GROUP_ID,
      display_name: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects display_name over 80 characters", () => {
    const result = addMemberSchema.safeParse({
      group_id: GROUP_ID,
      display_name: "a".repeat(81),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID for group_id", () => {
    const result = addMemberSchema.safeParse({
      group_id: "not-a-uuid",
      display_name: "Alice",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// expense_date
// ---------------------------------------------------------------------------

describe("expense_date", () => {
  const base = {
    group_id: GROUP_ID,
    item_name: "Dinner",
    amount_cents: 1000,
    participant_ids: [MEMBER_A],
    payers: [{ member_id: MEMBER_A, paid_cents: 1000 }],
  };

  it("accepts a valid ISO date", () => {
    const result = addExpenseSchema.safeParse({ ...base, expense_date: "2026-07-14" });
    expect(result.success).toBe(true);
  });

  it("is optional", () => {
    const result = addExpenseSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("rejects a non-date string", () => {
    const result = addExpenseSchema.safeParse({ ...base, expense_date: "yesterday" });
    expect(result.success).toBe(false);
  });

  it("rejects a datetime string (date-only expected)", () => {
    const result = addExpenseSchema.safeParse({ ...base, expense_date: "2026-07-14T10:00:00Z" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AI schemas: strictness + receipt arithmetic
// ---------------------------------------------------------------------------

describe("parsedReceiptSchema", () => {
  const item = (total_cents: number) => ({
    description: "Item",
    quantity: 1,
    unit_price_cents: total_cents,
    total_cents,
  });
  const base = {
    merchant: "Store",
    date: null,
    subtotal_cents: null,
    tax_cents: null,
    raw_text: "",
    confidence: 0.9,
  };

  it("accepts items that sum to the total", () => {
    const result = parsedReceiptSchema.safeParse({
      ...base,
      line_items: [item(6000), item(4000)],
      total_cents: 10000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts items + tax matching the total", () => {
    const result = parsedReceiptSchema.safeParse({
      ...base,
      tax_cents: 1200,
      line_items: [item(10000)],
      total_cents: 11200,
    });
    expect(result.success).toBe(true);
  });

  it("accepts items matching the subtotal", () => {
    const result = parsedReceiptSchema.safeParse({
      ...base,
      subtotal_cents: 10000,
      tax_cents: 1200,
      line_items: [item(10000)],
      total_cents: 11500, // odd total (e.g. service charge) — items==subtotal still passes
    });
    expect(result.success).toBe(true);
  });

  it("accepts small rounding drift within the tolerance", () => {
    // tol = max(100, 2% of 10000=200) = 200
    const result = parsedReceiptSchema.safeParse({
      ...base,
      line_items: [item(9850)],
      total_cents: 10000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects items wildly off the total", () => {
    const result = parsedReceiptSchema.safeParse({
      ...base,
      line_items: [item(5000)],
      total_cents: 10000,
    });
    expect(result.success).toBe(false);
  });

  it("accepts totals-only parses (no line items)", () => {
    const result = parsedReceiptSchema.safeParse({
      ...base,
      line_items: [],
      total_cents: 10000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects hallucinated extra keys (strict)", () => {
    const result = parsedReceiptSchema.safeParse({
      ...base,
      line_items: [item(10000)],
      total_cents: 10000,
      tip_suggestion: "15%",
    });
    expect(result.success).toBe(false);
  });
});

describe("expenseDraftSchema", () => {
  const base = {
    item_name: "Lunch",
    amount_cents: 5000,
    confidence: 0.8,
    participant_names: [],
    payer_name: null,
    category_slug: null,
    notes: null,
    source: "conversation" as const,
  };

  it("defaults date to null when omitted", () => {
    const result = expenseDraftSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.date).toBeNull();
  });

  it("accepts an ISO date", () => {
    const result = expenseDraftSchema.safeParse({ ...base, date: "2026-07-10" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.date).toBe("2026-07-10");
  });

  it("rejects extra keys (strict)", () => {
    const result = expenseDraftSchema.safeParse({ ...base, mood: "hungry" });
    expect(result.success).toBe(false);
  });
});
