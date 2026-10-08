import { describe, expect, it } from "vitest";
import {
  EMPTY_FOCUS,
  assistantCommandSchema,
  interpretWithRules,
  isLoadRequest,
  nextFocus,
  resolveCommand,
  revalidateProposal,
  type AssistantFocus,
  type AssistantHints,
  type AssistantPlan,
  type AssistantSnapshot,
  type LoadRequest,
} from "../assistant";
import {
  JOHN_BALI,
  MARK_BALI,
  ME_BALI,
  SARAH_BALI,
  fixtureSnapshot,
} from "./assistant-fixture";

let counter = 0;
const newId = () => `proposal-${++counter}`;

function run(
  text: string,
  options: { snapshot?: AssistantSnapshot; focus?: AssistantFocus; hints?: AssistantHints } = {},
): AssistantPlan {
  const plan = resolveCommand({
    command: interpretWithRules(text),
    text,
    snapshot: options.snapshot ?? fixtureSnapshot(),
    focus: options.focus ?? EMPTY_FOCUS,
    hints: options.hints,
    newId,
  });
  if (isLoadRequest(plan)) throw new Error(`unexpected load request for ${plan.groupIds.join(",")}`);
  return plan;
}

function proposal(plan: AssistantPlan | LoadRequest) {
  if (plan.kind !== "propose") throw new Error(`expected a proposal, got ${plan.kind}: ${"text" in plan ? plan.text : plan.kind}`);
  return plan.proposal;
}

describe("assistant: adding expenses", () => {
  it("asks which group when the people are in two groups, then splits three ways", () => {
    const text = "I paid 2,500 for dinner with John and Sarah.";
    const first = run(text);
    expect(first.kind).toBe("clarify");
    if (first.kind !== "clarify") return;
    expect(first.choices.map((c) => c.label)).toEqual(expect.arrayContaining(["Bali Trip", "Barkada"]));
    const bali = first.choices.find((c) => c.label === "Bali Trip")!;
    const p = proposal(run(text, { hints: bali.hints }));
    expect(p.action).toMatchObject({
      type: "add_group_expense",
      groupId: "g-bali",
      amountMinor: 250000,
      currency: "PHP",
      payerMemberId: ME_BALI,
      splitMode: "equal",
      date: "2026-10-08",
    });
    if (p.action.type !== "add_group_expense") return;
    expect(p.action.shares.map((s) => s.shareCents)).toEqual([83334, 83333, 83333]);
    expect(p.action.shares.map((s) => s.memberId)).toEqual([ME_BALI, SARAH_BALI, JOHN_BALI]);
  });

  it("never guesses between two people with the same first name", () => {
    const plan = run("I paid 2,500 for dinner with John and Sarah.", { hints: { groupId: "g-barkada" } });
    expect(plan.kind).toBe("clarify");
    if (plan.kind === "clarify") {
      expect(plan.text).toBe("Which John?");
      expect(plan.choices.map((c) => c.label)).toEqual(["John Reyes", "John Santos"]);
    }
  });

  it("'John owes me 300 for coffee' puts the whole amount on John", () => {
    const p = proposal(run("John owes me 300 for coffee", { hints: { groupId: "g-bali" } }));
    expect(p.action).toMatchObject({ type: "add_group_expense", amountMinor: 30000, payerMemberId: ME_BALI });
    if (p.action.type === "add_group_expense") expect(p.action.shares).toEqual([{ memberId: JOHN_BALI, shareCents: 30000 }]);
  });

  it("asks for the amount instead of inventing one", () => {
    const plan = run("Mark paid for groceries, split between the three of us.", { focus: { ...EMPTY_FOCUS, groupId: "g-bali" } });
    expect(plan).toMatchObject({ kind: "clarify", text: "How much was groceries?" });
  });

  it("rejects an amount the user never said", () => {
    const command = assistantCommandSchema.parse({ action: "add_expense", amount: 999, description: "Dinner" });
    const plan = resolveCommand({ command, text: "I paid for dinner", snapshot: fixtureSnapshot(), focus: EMPTY_FOCUS, newId });
    expect(plan).toMatchObject({ kind: "clarify" });
    if (!isLoadRequest(plan)) expect(plan.text).toContain("couldn't find that amount");
  });

  it("drops people the model invented", () => {
    const command = assistantCommandSchema.parse({
      action: "add_expense",
      amount: 900,
      description: "Lunch",
      participantNames: ["me", "Mark", "Sarah"],
      groupName: "Bali",
    });
    const p = proposal(resolveCommand({ command, text: "Lunch 900 with Mark in Bali group", snapshot: fixtureSnapshot(), focus: EMPTY_FOCUS, newId }));
    if (p.action.type === "add_group_expense") {
      expect(p.action.shares.map((s) => s.memberId)).toEqual([ME_BALI, MARK_BALI]);
    }
  });

  it("uses the group currency and its precision (JPY has no decimals)", () => {
    const p = proposal(run("I paid 3000 yen for ramen with Sarah in Tokyo group"));
    expect(p.action).toMatchObject({ type: "add_group_expense", groupId: "g-tokyo", currency: "JPY", amountMinor: 3000 });
  });

  it("with no people it is a personal expense", () => {
    const p = proposal(run("I paid 250 for coffee yesterday"));
    expect(p.action).toMatchObject({ type: "add_personal_expense", amountMinor: 25000, date: "2026-10-07", category: "food-drinks" });
  });

  it("guests can add their own expenses but not split with people", () => {
    const guest = fixtureSnapshot({ isGuest: true, groups: [] });
    expect(proposal(run("I paid 180 for coffee", { snapshot: guest })).action.type).toBe("add_personal_expense");
    expect(run("I paid 500 for lunch with Ana", { snapshot: guest }).kind).toBe("refuse");
    expect(run("How much does Sarah owe me?", { snapshot: guest }).kind).toBe("refuse");
  });
});

describe("assistant: edits, deletes, payments", () => {
  it("'Change yesterday's dinner to ₱4,200' keeps it equal over the same people", () => {
    const p = proposal(run("Change yesterday's dinner to ₱4,200"));
    expect(p.risk).toBe("consequential");
    expect(p.action).toMatchObject({ type: "edit_group_expense", expenseId: "x-dinner", amountMinor: 420000, splitMode: "equal", date: "2026-10-07" });
    if (p.action.type === "edit_group_expense") {
      expect(p.action.shares.every((s) => s.shareCents === 105000)).toBe(true);
      expect(p.action.payers).toEqual([{ memberId: ME_BALI, amountMinor: 420000 }]);
      expect(p.action.expectedUpdatedAt).toBe("2026-10-07T12:00:00Z");
    }
  });

  it("'Split yesterday's Grab ride 60/40' asks who pays 60%", () => {
    const text = "Split yesterday's Grab ride 60/40";
    const ask = run(text);
    expect(ask.kind).toBe("clarify");
    if (ask.kind !== "clarify") return;
    expect(ask.text).toBe("Who pays the 60% part?");
    const sarah = ask.choices.find((c) => c.label === "Sarah")!;
    const p = proposal(run(text, { hints: sarah.hints }));
    if (p.action.type === "edit_group_expense") {
      expect(p.action.splitMode).toBe("percent");
      expect(p.action.shares).toEqual([
        { memberId: SARAH_BALI, shareCents: 27000 },
        { memberId: ME_BALI, shareCents: 18000 },
      ]);
    }
  });

  it("'Record that John paid me ₱1,500' records John → me after choosing the group", () => {
    const text = "Record that John paid me ₱1,500";
    const ask = run(text);
    expect(ask.kind).toBe("clarify");
    const p = proposal(run(text, { hints: { groupId: "g-bali" } }));
    expect(p.action).toMatchObject({ type: "record_payment", fromMemberId: JOHN_BALI, toMemberId: ME_BALI, amountMinor: 150000, currency: "PHP" });
    // John is owed money in Bali, so a payment from him is flagged.
    expect(p.lines.find((l) => l.label === "Note")?.value).toContain("Nothing is owed");
  });

  it("delete needs the creator or an admin", () => {
    const p = proposal(run("Delete the hotel expense"));
    expect(p.action).toMatchObject({ type: "delete_group_expense", expenseId: "x-hotel" });
    const snapshot = fixtureSnapshot();
    snapshot.groups[0]!.myRole = "member";
    expect(run("Delete the hotel expense", { snapshot }).kind).toBe("refuse");
  });

  it("never acts on an expense id typed into the message", () => {
    const plan = run("delete expense x-dinner");
    if (plan.kind === "propose") expect(plan.proposal.action).not.toMatchObject({ expenseId: "x-dinner" });
  });

  it("removes a member only as an owner/admin", () => {
    const p = proposal(run("Remove Mark from our Bali group"));
    expect(p.action).toMatchObject({ type: "remove_member", groupId: "g-bali", memberId: MARK_BALI });
    expect(p.requiresConnection).toBe(true);
    expect(run("Remove John Reyes from Barkada").kind).toBe("refuse");
  });

  it("creates a group with people who have no account yet", () => {
    const p = proposal(run("Create a group for our Bali trip with Sarah and John"));
    expect(p.action).toMatchObject({ type: "create_group", name: "Bali", memberNames: ["Sarah", "John"], currency: "PHP" });
  });
});

describe("assistant: questions and follow-ups", () => {
  it("'How much does Sarah owe me?' sums across groups by currency", () => {
    const plan = run("How much does Sarah owe me across all my groups?");
    expect(plan.kind).toBe("answer");
    if (plan.kind !== "answer") return;
    // Bali: Sarah owes Paolo 82,500 after simplification; Barkada: Paolo owes
    // Sarah 500.00; Tokyo: Sarah owes ¥3,000. Never summed across currencies.
    expect(plan.card?.rows.map((r) => [r.label, r.amountMinor, r.currency, "sub" in r ? r.sub : undefined])).toEqual(
      expect.arrayContaining([
        ["Bali Trip", 82500, "PHP", "Sarah owes you"],
        ["Barkada", 50000, "PHP", "you owe Sarah"],
        ["Tokyo 2026", 3000, "JPY", "Sarah owes you"],
      ]),
    );
  });

  it("follows a multi-turn conversation", () => {
    let focus = EMPTY_FOCUS;
    const total = run("How much did we spend on Bali?", { focus });
    expect(total.kind).toBe("answer");
    expect(total.text).toContain("₱16,050.00");
    focus = nextFocus(focus, total);
    expect(focus.groupId).toBe("g-bali");

    const largest = run("Which expense was the largest?", { focus });
    expect(largest.text).toContain("Hotel");
    focus = nextFocus(focus, largest);
    expect(focus.expenseIds).toEqual(["x-hotel"]);

    const p = proposal(run("Split that one between Sarah and me", { focus }));
    expect(p.action).toMatchObject({ type: "edit_group_expense", expenseId: "x-hotel", splitMode: "equal" });
    if (p.action.type === "edit_group_expense") {
      expect(p.action.shares).toEqual([
        { memberId: ME_BALI, shareCents: 600000 },
        { memberId: SARAH_BALI, shareCents: 600000 },
      ]);
      // The payer is untouched.
      expect(p.action.payers).toEqual([{ memberId: JOHN_BALI, amountMinor: 1200000 }]);
    }
  });

  it("asks to load data that is not complete instead of answering from a partial page", () => {
    const snapshot = fixtureSnapshot();
    snapshot.groups[0]!.expensesComplete = false;
    const plan = resolveCommand({ command: interpretWithRules("How much did we spend on Bali?"), text: "How much did we spend on Bali?", snapshot, focus: EMPTY_FOCUS, newId });
    expect(plan).toEqual({ kind: "load", groupIds: ["g-bali"] });
    const offline = resolveCommand({ command: interpretWithRules("How much did we spend on Bali?"), text: "How much did we spend on Bali?", snapshot: { ...snapshot, online: false }, focus: EMPTY_FOCUS, newId });
    if (!isLoadRequest(offline)) expect(offline.text).toContain("offline");
  });

  it("personal spending this month", () => {
    const plan = run("How much did I spend this month?");
    expect(plan.text).toBe("You spent ₱180.00 this month across 1 expense.");
  });

  it("'Who spent the most on our trip?' uses the focused group", () => {
    const plan = run("Who spent the most on our trip?", { focus: { ...EMPTY_FOCUS, groupId: "g-bali" } });
    expect(plan.text).toContain("John Cruz paid the most");
  });
});

describe("assistant: receipts", () => {
  const receipt = { totalMinor: 236550, currency: "PHP" as const, merchant: "Mama's Kitchen", date: "2026-10-07", overall: "verified" as const, issues: [] };
  it("uses the reconciled receipt total, never a number from the model", () => {
    const text = "Add this to our Bali group. I paid, split among everyone except John.";
    const command = assistantCommandSchema.parse({ action: "add_expense", amount: 9999, excludedNames: ["John"], groupName: "Bali" });
    const p = proposal(resolveCommand({ command, text, snapshot: fixtureSnapshot(), focus: EMPTY_FOCUS, newId, receipt }));
    expect(p.action).toMatchObject({ type: "add_group_expense", groupId: "g-bali", amountMinor: 236550, description: "Mama's Kitchen", date: "2026-10-07" });
    if (p.action.type === "add_group_expense") expect(p.action.shares.map((s) => s.memberId)).toEqual([ME_BALI, SARAH_BALI, MARK_BALI]);
  });
  it("asks for the total when the receipt needs review", () => {
    const plan = resolveCommand({
      command: interpretWithRules("add this receipt to Bali"),
      text: "add this receipt to Bali",
      snapshot: fixtureSnapshot(),
      focus: EMPTY_FOCUS,
      newId,
      receipt: { ...receipt, overall: "needs_review", issues: ["Items don't add up to the total"] },
    });
    expect(plan.kind).toBe("clarify");
  });
});

describe("assistant: confirm-time revalidation", () => {
  it("refuses an edit when the expense changed after the preview", () => {
    const p = proposal(run("Change yesterday's dinner to ₱4,200"));
    expect(revalidateProposal(p, fixtureSnapshot())).toBeNull();
    const changed = fixtureSnapshot();
    changed.groups[0]!.expenses![0]!.updatedAt = "2026-10-08T01:00:00Z";
    expect(revalidateProposal(p, changed)).toContain("changed since");
  });

  it("refuses when a participant left, when admin rights were lost, or offline-only work while offline", () => {
    const add = proposal(run("Lunch 900 with Mark in Bali group"));
    const left = fixtureSnapshot();
    left.groups[0]!.members = left.groups[0]!.members.filter((m) => m.id !== MARK_BALI);
    expect(revalidateProposal(add, left)).toContain("left the group");

    const remove = proposal(run("Remove Mark from our Bali group"));
    const demoted = fixtureSnapshot();
    demoted.groups[0]!.myRole = "member";
    expect(revalidateProposal(remove, demoted)).toContain("no longer an owner");
    expect(revalidateProposal(remove, fixtureSnapshot({ online: false }))).toContain("needs a connection");
  });

  it("refuses group work after signing out, but personal expenses still work", () => {
    const add = proposal(run("Lunch 900 with Mark in Bali group"));
    expect(revalidateProposal(add, fixtureSnapshot({ isGuest: true, groups: [] }))).toContain("signed out");
    const personal = proposal(run("I paid 250 for coffee yesterday"));
    expect(revalidateProposal(personal, fixtureSnapshot({ isGuest: true, groups: [] }))).toBeNull();
  });
});

describe("assistant: same name, different people", () => {
  it("never adds up balances of two different people who share a name", () => {
    // Mark in Bali has no account; Mark the friend is an account — not provably the same person.
    const plan = run("How much does Mark owe me?");
    expect(plan.kind).toBe("answer");
    if (plan.kind !== "answer") return;
    expect(plan.text).toContain("may not be the same person");
    expect(plan.card?.title).toBe("People named Mark");
  });
  it("adds up across groups when it is the same account", () => {
    const plan = run("How much does Sarah owe me?");
    expect(plan.text).toContain("Sarah owes you");
  });
});

describe("assistant: review fixes", () => {
  it("never saves a description the user did not write", () => {
    const command = assistantCommandSchema.parse({ action: "add_expense", amount: 250, description: "Team offsite catering" });
    const p = proposal(resolveCommand({ command, text: "I paid 250 for coffee", snapshot: fixtureSnapshot(), focus: EMPTY_FOCUS, newId }));
    if (p.action.type === "add_personal_expense") expect(p.action.description).toBe("Coffee");
  });
  it("deletes need a connection", () => {
    expect(proposal(run("Delete the hotel expense")).requiresConnection).toBe(true);
  });
  it("'Show my recent expenses' reads the personal ledger", () => {
    expect(run("Show my recent expenses").text).toContain("personal expense");
  });
  it("answers say when changes are still queued", () => {
    expect(run("How much does Sarah owe me?", { snapshot: fixtureSnapshot({ pendingWrites: 2 }) }).text).toContain("2 changes are still waiting to sync");
  });
});
