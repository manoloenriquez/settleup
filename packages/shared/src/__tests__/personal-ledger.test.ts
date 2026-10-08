import { describe, expect, it } from "vitest";
import {
  addPersonalExpense,
  deletePersonalExpense,
  emptyPersonalLedger,
  groupPersonalExpensesByMonth,
  parsePersonalLedger,
  restorePersonalExpense,
  searchPersonalExpenses,
  summarizeMonth,
  updatePersonalExpense,
  visiblePersonalExpenses,
} from "../utils/personal-ledger";
import type { PersonalExpenseInput } from "../types/personal";

const T0 = "2026-10-01T08:00:00.000Z";
const T1 = "2026-10-01T09:00:00.000Z";
const guest = { now: T0, tracksSync: false };
const account = { now: T1, tracksSync: true };
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = (over: Partial<PersonalExpenseInput> = {}): PersonalExpenseInput => ({
  description: "Coffee",
  amountMinor: 18000,
  currency: "PHP",
  category: "food-drinks",
  date: "2026-10-01",
  source: "manual",
  ...over,
});

describe("personal ledger transitions", () => {
  it("adds, edits, deletes and restores with sync state", () => {
    let state = addPersonalExpense(emptyPersonalLedger(), id(1), input(), guest);
    expect(state.expenses[0]).toMatchObject({ sync: "local", notes: null, deletedAt: null, createdAt: T0 });

    state = updatePersonalExpense(state, id(1), input({ amountMinor: 20000, notes: "  " }), account);
    expect(state.expenses[0]).toMatchObject({ amountMinor: 20000, sync: "pending", notes: null, updatedAt: T1 });

    state = deletePersonalExpense(state, id(1), account);
    expect(visiblePersonalExpenses(state)).toHaveLength(0);
    expect(state.expenses[0]?.deletedAt).toBe(T1);

    state = restorePersonalExpense(state, id(1), guest);
    expect(visiblePersonalExpenses(state)).toHaveLength(1);
  });

  it("rejects invalid input, duplicate ids and edits of deleted records", () => {
    const base = addPersonalExpense(emptyPersonalLedger(), id(1), input(), guest);
    expect(() => addPersonalExpense(base, id(1), input(), guest)).toThrow();
    expect(() => addPersonalExpense(base, id(2), input({ amountMinor: 0 }), guest)).toThrow(/greater than zero/);
    expect(() => addPersonalExpense(base, id(2), input({ amountMinor: 12.5 }), guest)).toThrow();
    expect(() => addPersonalExpense(base, id(2), input({ description: "   " }), guest)).toThrow();
    expect(() => addPersonalExpense(base, id(2), input({ currency: "XXX" as "PHP" }), guest)).toThrow();
    const deleted = deletePersonalExpense(base, id(1), guest);
    expect(() => updatePersonalExpense(deleted, id(1), input(), guest)).toThrow(/deleted/);
    expect(() => deletePersonalExpense(base, id(9), guest)).toThrow();
  });

  it("keeps a corrupt store instead of replacing it", () => {
    expect(parsePersonalLedger(null)).toEqual(emptyPersonalLedger());
    expect(() => parsePersonalLedger({ version: 1, expenses: [{ id: "x" }] })).toThrow(/kept/);
  });
});

describe("summaries", () => {
  let state = emptyPersonalLedger();
  state = addPersonalExpense(state, id(1), input({ amountMinor: 18000, date: "2026-10-01" }), guest);
  state = addPersonalExpense(state, id(2), input({ amountMinor: 250000, category: "groceries", date: "2026-10-03" }), guest);
  state = addPersonalExpense(state, id(3), input({ amountMinor: 1200, currency: "USD", category: "transport", date: "2026-10-02" }), guest);
  state = addPersonalExpense(state, id(4), input({ amountMinor: 3000, currency: "JPY", date: "2026-09-30" }), guest);
  state = addPersonalExpense(state, id(5), input({ amountMinor: 999, date: "2026-10-04" }), guest);
  state = deletePersonalExpense(state, id(5), guest);

  it("never adds different currencies together and ignores deleted records", () => {
    const summary = summarizeMonth(state.expenses, "2026-10", "PHP");
    expect(summary.totals).toEqual([
      { currency: "PHP", amountMinor: 268000, count: 2 },
      { currency: "USD", amountMinor: 1200, count: 1 },
    ]);
    expect(summary.byCategory[0]).toEqual({ category: "groceries", currency: "PHP", amountMinor: 250000 });
  });

  it("groups history by month, newest first", () => {
    const sections = groupPersonalExpensesByMonth(visiblePersonalExpenses(state), "PHP");
    expect(sections.map((s) => s.month)).toEqual(["2026-10", "2026-09"]);
    expect(sections[0]?.expenses.map((e) => e.id)).toEqual([id(2), id(3), id(1)]);
    expect(sections[1]?.totals).toEqual([{ currency: "JPY", amountMinor: 3000, count: 1 }]);
  });

  it("searches description, merchant, notes and category", () => {
    const live = visiblePersonalExpenses(state);
    expect(searchPersonalExpenses(live, "GROCER").map((e) => e.id)).toEqual([id(2)]);
    expect(searchPersonalExpenses(live, "  ")).toHaveLength(4);
  });
});
