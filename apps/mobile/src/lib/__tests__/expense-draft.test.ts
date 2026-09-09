import { describe, expect, it } from "vitest";
import type { ExpenseDraft } from "@template/shared/types";
import {
  applySmartSplit,
  draftStorageKey,
  isDraftEmpty,
  isDraftResolved,
  parsePersistedDraft,
  receiptToLineItems,
  reconcileReceipt,
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

describe("reconcileReceipt", () => {
  const scanned = { total_cents: 112000, line_items: [{ total_cents: 60000 }, { total_cents: 40000 }] };

  it("keeps receipt-level charges as an explicit shared line so the total matches what was paid", () => {
    const result = reconcileReceipt(
      scanned,
      [
        { description: "Mains", total_cents: 60000, included: true },
        { description: "Drinks", total_cents: 40000, included: true },
      ],
      ["a", "b"],
    );
    expect(result.chargesCents).toBe(12000);
    expect(result.totalCents).toBe(112000);
    expect(result.lineItems.at(-1)).toEqual({ name: "Tax & charges", amountStr: "120.00", participantIds: ["a", "b"] });
  });

  it("still carries the charges when the user excludes an item", () => {
    const result = reconcileReceipt(
      scanned,
      [
        { description: "Mains", total_cents: 60000, included: true },
        { description: "Drinks", total_cents: 40000, included: false },
      ],
      ["a"],
    );
    expect(result.totalCents).toBe(72000);
    expect(result.lineItems.map((item) => item.name)).toEqual(["Mains", "Tax & charges"]);
  });

  it("adds nothing when the receipt had no line items or no surcharge", () => {
    expect(reconcileReceipt({ total_cents: 5000, line_items: [] }, [{ description: "Total", total_cents: 5000 }], ["a"]).chargesCents).toBe(0);
    expect(reconcileReceipt({ total_cents: 900, line_items: [{ total_cents: 1000 }] }, [{ description: "X", total_cents: 1000 }], ["a"]).totalCents).toBe(1000);
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
