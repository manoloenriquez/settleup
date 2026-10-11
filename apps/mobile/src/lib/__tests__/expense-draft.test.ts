import { describe, expect, it } from "vitest";
import type { ExpenseDraft } from "@template/shared/types";
import {
  applySmartSplit,
  draftStorageKey,
  isDraftEmpty,
  isDraftResolved,
  parsePersistedDraft,
  receiptToLineItems,
  applyDraftSplit,
  scaleToTotal,
  seedReceiptItems,
  resolutionEdited,
  resolveDraft,
} from "../expense-draft";

const members = [
  { id: "a", display_name: "Ana" },
  { id: "b", display_name: "Ben" },
  { id: "c", display_name: "Cara", departed_at: "2026-01-01T00:00:00Z" },
];

function draft(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    item_name: "Dinner",
    amount_cents: 1001,
    confidence: 0.9,
    participant_names: ["Ana", "Unknown"],
    payer_name: "ben",
    category_slug: null,
    notes: null,
    date: null,
    source: "conversation",
    ...overrides,
  };
}

describe("resolveDraft", () => {
  it("resolves exact names only and leaves unknown names unresolved", () => {
    const resolution = resolveDraft(draft(), members);
    expect(resolution.payerId).toBe("b");
    expect(resolution.participants).toEqual([
      { suggested: "Ana", memberId: "a" },
      { suggested: "Unknown", memberId: "" },
    ]);
    expect(isDraftResolved(resolution, members)).toBe(false);
  });

  it("assumes every active member when the AI names nobody", () => {
    const resolution = resolveDraft(draft({ participant_names: [], payer_name: "Ana" }), members);
    expect(resolution.participants.map((p) => p.memberId)).toEqual(["a", "b"]);
    expect(isDraftResolved(resolution, members)).toBe(true);
  });

  it("never resolves to a departed member", () => {
    const resolution = resolveDraft(draft({ participant_names: ["Cara"], payer_name: "Cara" }), members);
    expect(resolution.payerId).toBe("");
    expect(resolution.participants[0]?.memberId).toBe("");
  });

  it("rejects duplicate participants even when each is valid", () => {
    const resolution = resolveDraft(draft({ participant_names: ["Ana", "ANA"], payer_name: "Ben" }), members);
    expect(resolution.participants.map((p) => p.memberId)).toEqual(["a", "a"]);
    expect(isDraftResolved(resolution, members)).toBe(false);
  });

  it("detects whether the user changed the automatic resolution", () => {
    const auto = resolveDraft(draft(), members);
    const fixed = { ...auto, participants: [auto.participants[0]!, { suggested: "Unknown", memberId: "b" }] };
    expect(resolutionEdited(auto, auto)).toBe(false);
    expect(resolutionEdited(auto, fixed)).toBe(true);
  });
});

describe("applySmartSplit", () => {
  it("maps exact names to shares and reports the rest", () => {
    const result = applySmartSplit(
      [
        { member_name: "ana", share_cents: 700 },
        { member_name: "Ben", share_cents: 301 },
        { member_name: "Nobody", share_cents: 0 },
      ],
      members,
    );
    expect(result.shares).toEqual({ a: "7.00", b: "3.01" });
    expect(result.unmatched).toEqual(["Nobody"]);
  });
});

describe("receiptToLineItems", () => {
  it("keeps included, positive items and shares them with everyone", () => {
    const items = receiptToLineItems(
      [
        { description: "Sisig", total_cents: 25000, included: true },
        { description: "  ", total_cents: 1000, included: true },
        { description: "Excluded", total_cents: 500, included: false },
        { description: "Free", total_cents: 0 },
      ],
      ["a", "b"],
    );
    expect(items).toEqual([
      { name: "Sisig", amountStr: "250.00", participantIds: ["a", "b"] },
      { name: "Item 2", amountStr: "10.00", participantIds: ["a", "b"] },
    ]);
  });
});

describe("seedReceiptItems", () => {
  const line = (description: string, total_cents: number, quantity = 1) => ({
    description,
    quantity,
    unit_price_cents: Math.round(total_cents / quantity),
    total_cents,
  });

  it("adds receipt-level charges as an explicit shared line so the items add up to what was paid", () => {
    const seeded = seedReceiptItems({ merchant: "Cafe", total_cents: 112000, line_items: [line("Mains", 60000), line("Drinks", 40000)] });
    expect(seeded.chargesCents).toBe(12000);
    expect(seeded.discountCents).toBe(0);
    expect(seeded.items.map((item) => [item.description, item.total_cents, item.included])).toEqual([
      ["Mains", 60000, true],
      ["Drinks", 40000, true],
      ["Tax & charges", 12000, true],
    ]);
  });

  it("scales items down for a discount and keeps the sum exact", () => {
    const seeded = seedReceiptItems({ merchant: "Kiwami", total_cents: 100000, line_items: [line("A", 60000), line("B", 40000), line("C", 66600)] });
    expect(seeded.discountCents).toBe(66600);
    const total = seeded.items.reduce((sum, item) => sum + item.total_cents, 0);
    expect(total).toBe(100000);
    expect(seeded.items.map((item) => item.total_cents)).toEqual([36014, 24010, 39976]);
    expect(seeded.chargesCents).toBe(0);
  });

  it("turns a totals-only scan into a single line and leaves matching totals alone", () => {
    expect(seedReceiptItems({ merchant: null, total_cents: 5000, line_items: [] }).items).toEqual([
      { description: "Total", quantity: 1, unit_price_cents: 5000, total_cents: 5000, included: true },
    ]);
    const exact = seedReceiptItems({ merchant: "X", total_cents: 1000, line_items: [line("X", 1000)] });
    expect(exact.items).toHaveLength(1);
    expect(exact.chargesCents).toBe(0);
    expect(exact.discountCents).toBe(0);
  });
});

describe("scaleToTotal", () => {
  it("uses largest-remainder rounding so the cents sum exactly", () => {
    expect(scaleToTotal([100, 100, 100], 200)).toEqual([67, 67, 66]);
    expect(scaleToTotal([333, 333, 334], 100)).toEqual([33, 33, 34]);
    expect(scaleToTotal([0, 0], 100)).toEqual([0, 0]);
  });
});

describe("applyDraftSplit", () => {
  const participants = [
    { memberId: "m1", name: "Manolo" },
    { memberId: "m2", name: "Mia" },
    { memberId: "m3", name: "Sarah" },
  ];

  it("prefills percentages", () => {
    const split = applyDraftSplit(
      { mode: "percent", shares: [{ member_name: "Manolo", percent: 60, weight: null, fixed_cents: null, excluded: false }, { member_name: "Mia", percent: 40, weight: null, fixed_cents: null, excluded: false }] },
      participants.slice(0, 2),
      360000,
    );
    expect(split.splitMode).toBe("percent");
    expect(split.percentShares).toEqual({ m1: "60", m2: "40" });
  });

  it("prefills share weights, exclusions and fixed amounts", () => {
    const weights = applyDraftSplit(
      { mode: "shares", shares: [{ member_name: "Manolo", percent: null, weight: 2, fixed_cents: null, excluded: false }] },
      participants,
      30000,
    );
    expect(weights).toMatchObject({ splitMode: "shares", shareWeights: { m1: "2" } });

    const excluded = applyDraftSplit(
      { mode: "exclude", shares: [{ member_name: "Mia", percent: null, weight: null, fixed_cents: null, excluded: true }] },
      participants,
      30000,
    );
    expect(excluded).toMatchObject({ splitMode: "equal", excludedMemberIds: ["m2"] });

    const fixed = applyDraftSplit(
      { mode: "fixed", shares: [{ member_name: "Manolo", percent: null, weight: null, fixed_cents: 20000, excluded: false }] },
      participants,
      100000,
    );
    expect(fixed.splitMode).toBe("custom");
    expect(fixed.customShares).toEqual({ m1: "200.00", m2: "400.00", m3: "400.00" });
  });

  it("falls back to an equal split when names do not resolve or percentages are off", () => {
    expect(applyDraftSplit({ mode: "percent", shares: [{ member_name: "Zed", percent: 100, weight: null, fixed_cents: null, excluded: false }] }, participants, 1000).splitMode).toBe("equal");
    expect(applyDraftSplit({ mode: "percent", shares: [{ member_name: "Manolo", percent: 30, weight: null, fixed_cents: null, excluded: false }] }, participants, 1000).splitMode).toBe("equal");
    expect(applyDraftSplit(null, participants, 1000).splitMode).toBe("equal");
  });
});

describe("persisted draft", () => {
  const base = {
    version: 1 as const,
    savedAt: "2026-09-10T00:00:00Z",
    mode: "detailed" as const,
    itemName: "",
    amount: "",
    notes: "",
    selectedMemberIds: ["a"],
    payerMemberId: "a",
    categoryId: null,
    expenseDate: "2026-09-10",
    splitMode: "equal" as const,
    customShares: {},
    percentShares: {},
    shareWeights: {},
    repeats: "none" as const,
    multiPayer: false,
    payerAmounts: {},
    lineItems: [{ name: "", amountStr: "", participantIds: [] }],
  };

  it("treats untouched forms as empty", () => {
    expect(isDraftEmpty(base)).toBe(true);
    expect(isDraftEmpty({ ...base, amount: "12" })).toBe(false);
    expect(isDraftEmpty({ ...base, lineItems: [{ name: "Beer", amountStr: "", participantIds: [] }] })).toBe(false);
  });

  it("round-trips through storage and rejects foreign shapes", () => {
    expect(parsePersistedDraft(JSON.stringify(base))).toEqual(base);
    expect(parsePersistedDraft(JSON.stringify({ ...base, version: 2 }))).toBeNull();
    expect(parsePersistedDraft("{not json")).toBeNull();
    expect(parsePersistedDraft(null)).toBeNull();
  });

  it("keys drafts per account and group", () => {
    expect(draftStorageKey("u1", "g1")).not.toBe(draftStorageKey("u1", "g2"));
    expect(draftStorageKey("u1", "g1")).not.toBe(draftStorageKey("u2", "g1"));
  });
});
