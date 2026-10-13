import { describe, expect, it } from "vitest";
import {
  budgetRevision,
  createBudgetDocument,
  defaultBudgetConfig,
  interpretWithRules,
  mergeFollowUp,
  resolveCommand,
  revalidateProposal,
  withAnnotation,
  type AssistantHints,
  type AssistantPlan,
  type AssistantSnapshot,
  type BudgetDocument,
  type LoadRequest,
  type SpendSource,
} from "../index";
import { EMPTY_FOCUS } from "../assistant";

// ---------------------------------------------------------------------------
// The Assistant on budgets (scenario J): budget phrasing is never read as an
// expense, every figure comes from the engine, amounts must be the user's own
// words, and every change is a proposal checked again at Confirm.
// Monday 1 February 2027 is the first day of a four-week month.
// ---------------------------------------------------------------------------

const P = (pesos: number): number => Math.round(pesos * 100);
let counter = 0;
const uuid = (): string => `00000000-0000-4000-9000-${String(++counter).padStart(12, "0")}`;

function doc(over: Partial<ReturnType<typeof defaultBudgetConfig>> = {}): BudgetDocument {
  return createBudgetDocument({
    id: uuid(),
    config: { ...defaultBudgetConfig("PHP"), monthlyLimitMinor: P(60_000), weeklyTargetMinor: P(7_000), ...over },
    startDate: "2027-02-01",
    meta: { planId: uuid(), now: "2027-01-31T00:00:00.000Z", source: "setup", summary: "Set up" },
  });
}

function spend(date: string, pesos: number): SpendSource {
  return { ref: `personal:${uuid()}`, kind: "personal", description: "Spending", amountMinor: P(pesos), currency: "PHP", category: "food-drinks", date };
}

function snapshot(budget: BudgetDocument | null, today: string, sources: SpendSource[] = []): AssistantSnapshot {
  return { today, isGuest: true, online: true, myName: null, defaultCurrency: "PHP", groups: [], personal: [], budget: { doc: budget, sources } };
}

function plan(text: string, snap: AssistantSnapshot, hints?: AssistantHints): AssistantPlan {
  const result: AssistantPlan | LoadRequest = resolveCommand({ command: interpretWithRules(text), text, snapshot: snap, focus: EMPTY_FOCUS, newId: uuid, ...(hints ? { hints } : {}) });
  if (result.kind === "load") throw new Error("unexpected load");
  return result;
}

describe("budget phrasing", () => {
  const cases: [string, string][] = [
    ["Can I afford to spend 4k this weekend?", "afford"],
    ["How much can I safely spend today?", "status"],
    ["Increase my dining budget by 1k", "change"],
    ["I overspent this week. Help me recover.", "recover"],
    ["I have a vacation next week. Adjust my budget.", "plan"],
    ["Why did my weekly allowance decrease?", "explain"],
    ["How much have I saved by underspending?", "savings"],
    ["Show me where most of my money went this month", "breakdown"],
    ["Can I afford this purchase without exceeding my monthly budget?", "afford"],
    ["Help me reduce my spending by 15% next month", "change"],
    ["I want to allocate 60k monthly for spending. Help me create a budget.", "setup"],
    ["Am I on track this month?", "forecast"],
    ["Set my weekly budget to 8k", "change"],
  ];
  it.each(cases)("%s → %s", (text, intent) => {
    const command = interpretWithRules(text);
    expect(command.action).toBe("budget");
    expect(command.budgetIntent).toBe(intent);
  });

  it("still reads ordinary expenses and questions as before", () => {
    expect(interpretWithRules("I paid 900 for lunch with Ana").action).toBe("add_expense");
    expect(interpretWithRules("How much does Ana owe me?").action).toBe("query_balance");
    expect(interpretWithRules("Spent 250 on coffee").action).toBe("add_expense");
    expect(interpretWithRules("How much did we spend in Bali?").action).toBe("query_spending");
  });

  it("reads the change details", () => {
    const dining = interpretWithRules("Increase my dining budget by 1k");
    expect(dining).toMatchObject({ changeKind: "increase", budgetField: "category", description: "dining", amount: 1000 });
    const weekly = interpretWithRules("Set my weekly budget to 8k");
    expect(weekly).toMatchObject({ changeKind: "set", budgetField: "weekly", amount: 8000 });
    const pct = interpretWithRules("Help me reduce my spending by 15% next month");
    expect(pct).toMatchObject({ changeKind: "decrease", percent: 15, dateMention: "next month", amount: 0 });
  });
});

describe("budget answers", () => {
  const budget = doc();

  it("answers today's, this week's and this month's figures from the engine", () => {
    const answer = plan("How much can I safely spend today?", snapshot(budget, "2027-02-08", [spend("2027-02-03", 5_000)]));
    expect(answer.kind).toBe("answer");
    expect(answer.kind === "answer" && answer.text).toContain("₱1,285.71"); // ₱9,000 over 7 days, floored
    expect(answer.kind === "answer" && answer.text).toContain("₱9,000.00 is left this week");
  });

  it("checks affordability against the weekend's share, the week and the month", () => {
    const snap = snapshot(budget, "2027-02-05", [spend("2027-02-02", 2_000)]);
    const yes = plan("Can I afford to spend 3k this weekend?", snap);
    expect(yes.kind === "answer" && yes.text).toMatch(/^Yes\./);
    const over = plan("Can I afford to spend 6k this weekend?", snap);
    expect(over.kind === "answer" && over.text).toContain("Not within this week");
    const month = plan("Can I afford to spend 70k?", snap);
    expect(month.kind === "answer" && month.text).toMatch(/^No\./);
  });

  it("never invents an amount the user didn't say", () => {
    const ask = plan("Can I afford this purchase without exceeding my monthly budget?", snapshot(budget, "2027-02-05"));
    expect(ask.kind).toBe("clarify");
    const command = { ...interpretWithRules("Can I afford it?"), amount: 9999 };
    const result = resolveCommand({ command, text: "Can I afford it?", snapshot: snapshot(budget, "2027-02-05"), focus: EMPTY_FOCUS, newId: uuid });
    expect(result.kind).toBe("clarify");
  });

  it("explains a lower allowance by its sources", () => {
    const answer = plan("Why did my weekly allowance decrease?", snapshot(budget, "2027-02-08", [spend("2027-02-03", 9_000)]));
    expect(answer.kind === "answer" && answer.text).toContain("making up for overspending");
    expect(answer.kind === "answer" && answer.card?.rows.map((r) => r.amountMinor)).toEqual([P(7_000), P(2_000), P(5_000)]);
  });

  it("explains where the money went and how much was saved", () => {
    const snap = snapshot(budget, "2027-02-10", [spend("2027-02-03", 5_000)]);
    const breakdown = plan("Show me where most of my money went this month", snap);
    expect(breakdown.kind === "answer" && breakdown.text).toContain("Food & Drinks");
    const saved = plan("How much have I saved by underspending?", snap);
    expect(saved.kind === "answer" && saved.text).toContain("₱2,000.00");
  });

  it("says there is no budget yet and offers setup", () => {
    const result = plan("How much can I safely spend today?", snapshot(null, "2027-02-08"));
    expect(result.kind).toBe("refuse");
    expect(result.kind === "refuse" && result.route).toEqual({ screen: "budget_setup" });
  });
});

describe("budget changes are proposals", () => {
  it("proposes a new budget from a monthly amount and shows the weekly plan", () => {
    const result = plan("I want to allocate 60k monthly for spending. Help me create a budget.", snapshot(null, "2027-02-01"));
    expect(result.kind).toBe("propose");
    if (result.kind !== "propose") return;
    expect(result.proposal.action).toMatchObject({ type: "budget_setup" });
    expect(result.proposal.lines.find((l) => l.label === "Monthly limit")?.value).toBe("₱60,000.00");
    expect(result.proposal.lines.find((l) => l.label === "Weekly allowance")?.value).toBe("₱13,500.00");
  });

  it("asks only for the monthly amount when it's missing, then uses the answer", () => {
    const snap = snapshot(null, "2027-02-01");
    const first = interpretWithRules("Help me create a budget");
    const ask = resolveCommand({ command: first, text: "Help me create a budget", snapshot: snap, focus: EMPTY_FOCUS, newId: uuid });
    expect(ask.kind).toBe("clarify");
    const merged = mergeFollowUp({ command: first, text: "Help me create a budget" }, interpretWithRules("50k"), "50k");
    expect(merged.merged).toBe(true);
    const result = resolveCommand({ command: merged.command, text: merged.text, snapshot: snap, focus: EMPTY_FOCUS, newId: uuid });
    expect(result.kind === "propose" && result.proposal.lines[0]!.value).toBe("₱50,000.00");
  });

  it("previews a weekly change with this week's new allowance", () => {
    const result = plan("Set my weekly budget to 8k", snapshot(doc(), "2027-02-10"));
    expect(result.kind).toBe("propose");
    if (result.kind !== "propose") return;
    expect(result.proposal.lines[0]).toEqual({ label: "Weekly allowance", value: "₱8,000.00", before: "₱7,000.00" });
    // Week 1 went unspent, so this week also carries ₱7,000: ₱14,000 → ₱15,000.
    expect(result.proposal.lines[1]).toMatchObject({ value: "₱15,000.00", before: "₱14,000.00" });
  });

  it("adds a category limit and scales the whole budget by a percentage from next month", () => {
    const dining = plan("Increase my dining budget by 1k", snapshot(doc(), "2027-02-10"));
    expect(dining.kind === "propose" && dining.proposal.lines[0]).toMatchObject({ label: "Food & Drinks limit (monthly)", value: "₱1,000.00" });
    const cut = plan("Help me reduce my spending by 15% next month", snapshot(doc(), "2027-02-10"));
    if (cut.kind !== "propose") throw new Error(cut.kind);
    expect(cut.proposal.action).toMatchObject({ type: "budget_change", effectiveFrom: "2027-03-01" });
    expect(cut.proposal.lines.map((l) => l.value)).toEqual(expect.arrayContaining(["₱51,000.00", "₱5,950.00", "1 Mar"]));
  });

  it("asks which figure when 'my budget' is ambiguous", () => {
    const result = plan("Increase my budget by 2k", snapshot(doc(), "2027-02-10"));
    expect(result.kind).toBe("clarify");
    const chosen = plan("Increase my budget by 2k", snapshot(doc(), "2027-02-10"), { budgetField: "weekly" });
    expect(chosen.kind === "propose" && chosen.proposal.lines[0]!.value).toBe("₱9,000.00");
  });

  it("offers recovery options and proposes the one chosen", () => {
    const snap = snapshot(doc(), "2027-02-04", [spend("2027-02-02", 10_000)]);
    const options = plan("I overspent this week. Help me recover.", snap);
    expect(options.kind).toBe("clarify");
    expect(options.kind === "clarify" && options.choices.map((c) => c.label)[0]).toContain("All from next week (next week ₱4,000.00)");
    const three = plan("I overspent this week. Help me recover.", snap, { recoveryWeeks: 3 });
    if (three.kind !== "propose") throw new Error(three.kind);
    expect(three.proposal.action).toMatchObject({ type: "budget_change", config: { recovery: { mode: "smoothed", weeks: 3 } } });
  });

  it("asks how much for a vacation, then sets it aside for next week's dates", () => {
    const snap = snapshot(doc(), "2027-02-10");
    const text = "I have a vacation next week. Adjust my budget.";
    const ask = plan(text, snap);
    expect(ask.kind).toBe("clarify");
    const merged = mergeFollowUp({ command: interpretWithRules(text), text }, interpretWithRules("15k"), "15k");
    const result = resolveCommand({ command: merged.command, text: merged.text, snapshot: snap, focus: EMPTY_FOCUS, newId: uuid });
    if (result.kind !== "propose") throw new Error(result.kind);
    expect(result.proposal.action).toMatchObject({ type: "budget_plan", amountMinor: P(15_000), from: "2027-02-15", to: "2027-02-21", coversAllSpending: true });
  });

  it("refuses at Confirm when the budget changed after the preview", () => {
    const budget = doc();
    const result = plan("Set my weekly budget to 8k", snapshot(budget, "2027-02-10"));
    if (result.kind !== "propose") throw new Error(result.kind);
    expect(revalidateProposal(result.proposal, snapshot(budget, "2027-02-10"))).toBeNull();
    const edited = withAnnotation(budget, { id: uuid(), kind: "exclude", createdAt: "2027-02-10T00:00:00.000Z", deletedAt: null, ref: `personal:${uuid()}` });
    expect(budgetRevision(edited)).not.toBe(budgetRevision(budget));
    expect(revalidateProposal(result.proposal, snapshot(edited, "2027-02-10"))).toMatch(/changed/);
  });
});
