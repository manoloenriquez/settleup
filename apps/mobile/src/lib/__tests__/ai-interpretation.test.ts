import { describe, it, expect } from "vitest";
import {
  amountAppearsInText,
  buildInsightFacts,
  interpretationToDraft,
  resolveSelfName,
  splitInterpretationToResult,
} from "@/lib/ai/interpretation";
import type { ExpenseInterpretation, SplitInterpretation } from "@/lib/ai/apple-intelligence";

const members = ["Manolo", "Sarah", "John", "Mia"];
const today = "2026-09-30";

function interpretation(overrides: Partial<ExpenseInterpretation>): ExpenseInterpretation {
  return {
    isExpense: true,
    reply: "Got it.",
    itemName: "Dinner at Mendokoro",
    amount: 2400,
    payerName: "me",
    participantNames: ["me", "Sarah", "John"],
    category: "food-drinks",
    dateMention: null,
    notes: null,
    splitMode: "equal",
    splitDetails: [],
    ...overrides,
  };
}

describe("interpretationToDraft", () => {
  it("maps a plain equal split into an ExpenseDraft with cents and resolved self", () => {
    const { draft, reply } = interpretationToDraft(
      interpretation({}),
      { text: "Dinner at Mendokoro 2400 split equally between me, Sarah and John.", userName: "Manolo", today },
    );
    expect(reply).toBe("Got it.");
    expect(draft).toMatchObject({
      item_name: "Dinner at Mendokoro",
      amount_cents: 240000,
      payer_name: "Manolo",
      participant_names: ["Manolo", "Sarah", "John"],
      category_slug: "food-drinks",
      date: null,
      source: "conversation",
      split: null,
    });
  });

  it("carries percentages and resolves relative dates deterministically", () => {
    const { draft } = interpretationToDraft(
      interpretation({
        itemName: "groceries",
        amount: 3600,
        participantNames: ["me", "Mia"],
        category: "groceries",
        dateMention: "yesterday",
        splitMode: "percent",
        splitDetails: [
          { name: "me", percent: 60, fixedAmount: null, weight: null, excluded: false },
          { name: "Mia", percent: 40, fixedAmount: null, weight: null, excluded: false },
        ],
      }),
      { text: "I paid 3600 for groceries yesterday, split 60/40 between me and Mia.", userName: "Manolo", today },
    );
    expect(draft?.date).toBe("2026-09-29");
    expect(draft?.split).toEqual({
      mode: "percent",
      shares: [
        { member_name: "Manolo", percent: 60, weight: null, fixed_cents: null, excluded: false },
        { member_name: "Mia", percent: 40, weight: null, fixed_cents: null, excluded: false },
      ],
    });
  });

  it("refuses a draft when the model says expense but the amount is not in the message", () => {
    const { draft, reply } = interpretationToDraft(
      interpretation({}),
      { text: "What's the weather like today?", userName: "Manolo", today },
    );
    expect(draft).toBeNull();
    expect(reply).toMatch(/couldn't find that amount/i);
  });

  it("returns the model's reply and no draft for non-expenses", () => {
    const { draft, reply } = interpretationToDraft(
      interpretation({ isExpense: false, amount: 0, reply: "That isn't an expense." }),
      { text: "hello", userName: null, today },
    );
    expect(draft).toBeNull();
    expect(reply).toBe("That isn't an expense.");
  });

  it("falls back to the keyword category when the model picks other", () => {
    const { draft } = interpretationToDraft(
      interpretation({ itemName: "Grab to the airport", amount: 1250.5, category: "other" }),
      { text: "Grab to the airport ₱1,250.50", userName: "Manolo", today },
    );
    expect(draft?.category_slug).toBe("transport");
    expect(draft?.amount_cents).toBe(125050);
  });
});

describe("amountAppearsInText / resolveSelfName", () => {
  it("recognises formatted amounts", () => {
    expect(amountAppearsInText(1250.5, "₱1,250.50 for grab")).toBe(true);
    expect(amountAppearsInText(2400, "dinner 2400")).toBe(true);
    expect(amountAppearsInText(2400, "dinner 2,400.00")).toBe(true);
    expect(amountAppearsInText(2400, "dinner tonight")).toBe(false);
  });
  it("maps first-person words to the signed-in member", () => {
    expect(resolveSelfName("me", "Manolo")).toBe("Manolo");
    expect(resolveSelfName("I", "Manolo")).toBe("Manolo");
    expect(resolveSelfName("Sarah", "Manolo")).toBe("Sarah");
    expect(resolveSelfName("me", null)).toBe("me");
    expect(resolveSelfName(null, "Manolo")).toBeNull();
  });
});

describe("splitInterpretationToResult", () => {
  const share = (name: string, extra: Partial<SplitInterpretation["shares"][number]> = {}): SplitInterpretation["shares"][number] => ({
    name,
    percent: null,
    fixedAmount: null,
    weight: null,
    excluded: false,
    ...extra,
  });

  it("applies percentages exactly to the cent", () => {
    const result = splitInterpretationToResult(
      { mode: "percent", shares: [share("Manolo", { percent: 60 }), share("Mia", { percent: 40 })], explanation: "60/40" },
      360000,
      ["Manolo", "Mia"],
    );
    expect(result?.mode).toBe("custom");
    expect(result?.suggestions.map((s) => s.share_cents)).toEqual([216000, 144000]);
  });

  it("excludes members and splits the rest equally", () => {
    const result = splitInterpretationToResult(
      { mode: "exclude", shares: [share("Mia", { excluded: true })], explanation: "Mia skipped drinks" },
      80000,
      members,
    );
    expect(result?.suggestions.map((s) => s.share_cents)).toEqual([26667, 26667, 26666, 0]);
    expect(result?.suggestions.reduce((sum, s) => sum + s.share_cents, 0)).toBe(80000);
  });

  it("weights shares and handles fixed amounts with the remainder split equally", () => {
    const weighted = splitInterpretationToResult(
      { mode: "shares", shares: [share("Manolo", { weight: 2 })], explanation: "Manolo had two" },
      30000,
      ["Manolo", "Sarah", "John"],
    );
    expect(weighted?.suggestions.map((s) => s.share_cents)).toEqual([15000, 7500, 7500]);

    const fixed = splitInterpretationToResult(
      { mode: "fixed", shares: [share("Manolo", { fixedAmount: 200 })], explanation: "Manolo pays 200" },
      100000,
      ["Manolo", "Sarah", "John"],
    );
    expect(fixed?.suggestions.map((s) => s.share_cents)).toEqual([20000, 40000, 40000]);
  });

  it("rejects unknown names and percentages that do not add up", () => {
    expect(
      splitInterpretationToResult({ mode: "percent", shares: [share("Zed", { percent: 100 })], explanation: "" }, 1000, members),
    ).toBeNull();
    expect(
      splitInterpretationToResult(
        { mode: "percent", shares: [share("Manolo", { percent: 50 }), share("Mia", { percent: 30 })], explanation: "" },
        1000,
        ["Manolo", "Mia"],
      ),
    ).toBeNull();
    expect(
      splitInterpretationToResult({ mode: "fixed", shares: [share("Manolo", { fixedAmount: 50 })], explanation: "" }, 1000, ["Manolo"]),
    ).toBeNull();
  });
});

describe("buildInsightFacts", () => {
  it("renders statistics as sentences with peso formatting", () => {
    const facts = buildInsightFacts("Baguio Trip", {
      total_expenses: 14,
      total_amount_cents: 1845000,
      average_expense_cents: 131786,
      top_spender: { name: "Sarah", amount_cents: 720000 },
      most_common_item: { name: "Coffee", count: 3 },
      top_category: { name: "Food & drinks", slug: "food-drinks", amount_cents: 980000 },
      categories: [
        { id: null, name: "Food & drinks", slug: "food-drinks", icon: "utensils", color: "#000", amount_cents: 980000, expense_count: 8 },
      ],
      period: { first_expense: "2026-09-01", last_expense: "2026-09-05" },
    });
    expect(facts).toContain("14 expenses totalling ₱18,450.00");
    expect(facts).toContain("average expense is ₱1,317.86");
    expect(facts).toContain("Top payer: Sarah paid ₱7,200.00");
    expect(facts).toContain("Food & drinks ₱9,800.00 (8 expenses)");
  });
});
