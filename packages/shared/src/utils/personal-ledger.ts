import { personalExpenseInputSchema, personalLedgerStateSchema } from "../schemas/personal";
import type {
  PersonalExpense,
  PersonalExpenseInput,
  PersonalLedgerState,
} from "../types/personal";
import type { CurrencyCode } from "./currency";
import type { CategorySlug } from "./category";

// ---------------------------------------------------------------------------
// Pure state transitions for the on-device personal ledger. The mobile store
// persists the returned state; nothing here touches storage or the network.
// ---------------------------------------------------------------------------

export function emptyPersonalLedger(): PersonalLedgerState {
  return { version: 1, expenses: [] };
}

/** Parse persisted state; throws so a corrupt store is kept, never overwritten. */
export function parsePersonalLedger(raw: unknown): PersonalLedgerState {
  if (raw === null || raw === undefined) return emptyPersonalLedger();
  const result = personalLedgerStateSchema.safeParse(raw);
  if (!result.success) {
    throw new Error("Saved expenses on this device could not be read. They have been kept.");
  }
  return result.data;
}

export type PersonalWriteContext = {
  now: string;
  /** Signed-in stores upload changes; guest stores keep everything local. */
  tracksSync: boolean;
};

export type PersonalValidation =
  | { ok: true; value: ReturnType<typeof personalExpenseInputSchema.parse> }
  | { ok: false; error: string };

export function validatePersonalExpenseInput(input: PersonalExpenseInput): PersonalValidation {
  const result = personalExpenseInputSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "Check the expense details." };
}

function changedSyncState(ctx: PersonalWriteContext): PersonalExpense["sync"] {
  return ctx.tracksSync ? "pending" : "local";
}

export function addPersonalExpense(
  state: PersonalLedgerState,
  id: string,
  input: PersonalExpenseInput,
  ctx: PersonalWriteContext,
): PersonalLedgerState {
  const valid = validatePersonalExpenseInput(input);
  if (!valid.ok) throw new Error(valid.error);
  if (state.expenses.some((expense) => expense.id === id)) {
    throw new Error("An expense with this id already exists.");
  }
  const expense: PersonalExpense = {
    id,
    description: valid.value.description,
    amountMinor: valid.value.amountMinor,
    currency: valid.value.currency,
    category: valid.value.category,
    date: valid.value.date,
    notes: valid.value.notes?.length ? valid.value.notes : null,
    merchant: valid.value.merchant?.length ? valid.value.merchant : null,
    source: valid.value.source,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
    sync: changedSyncState(ctx),
    serverUpdatedAt: null,
  };
  return { ...state, expenses: [...state.expenses, expense] };
}

function replace(
  state: PersonalLedgerState,
  id: string,
  change: (expense: PersonalExpense) => PersonalExpense,
): PersonalLedgerState {
  let found = false;
  const expenses = state.expenses.map((expense) => {
    if (expense.id !== id) return expense;
    found = true;
    return change(expense);
  });
  if (!found) throw new Error("That expense no longer exists on this device.");
  return { ...state, expenses };
}

export function updatePersonalExpense(
  state: PersonalLedgerState,
  id: string,
  input: PersonalExpenseInput,
  ctx: PersonalWriteContext,
): PersonalLedgerState {
  const valid = validatePersonalExpenseInput(input);
  if (!valid.ok) throw new Error(valid.error);
  return replace(state, id, (expense) => {
    if (expense.deletedAt) throw new Error("That expense was deleted.");
    return {
      ...expense,
      description: valid.value.description,
      amountMinor: valid.value.amountMinor,
      currency: valid.value.currency,
      category: valid.value.category,
      date: valid.value.date,
      notes: valid.value.notes?.length ? valid.value.notes : null,
      merchant: valid.value.merchant?.length ? valid.value.merchant : null,
      source: valid.value.source,
      updatedAt: ctx.now,
      sync: changedSyncState(ctx),
    };
  });
}

/** Tombstone, so the deletion can sync to other devices and be undone. */
export function deletePersonalExpense(
  state: PersonalLedgerState,
  id: string,
  ctx: PersonalWriteContext,
): PersonalLedgerState {
  return replace(state, id, (expense) =>
    expense.deletedAt
      ? expense
      : { ...expense, deletedAt: ctx.now, updatedAt: ctx.now, sync: changedSyncState(ctx) },
  );
}

export function restorePersonalExpense(
  state: PersonalLedgerState,
  id: string,
  ctx: PersonalWriteContext,
): PersonalLedgerState {
  return replace(state, id, (expense) =>
    expense.deletedAt
      ? { ...expense, deletedAt: null, updatedAt: ctx.now, sync: changedSyncState(ctx) }
      : expense,
  );
}

/** Live expenses, newest first (by date, then by creation). */
export function visiblePersonalExpenses(state: PersonalLedgerState): PersonalExpense[] {
  return state.expenses
    .filter((expense) => !expense.deletedAt)
    .sort((a, b) =>
      a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
    );
}

export function searchPersonalExpenses(
  expenses: readonly PersonalExpense[],
  query: string,
): PersonalExpense[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...expenses];
  return expenses.filter((expense) =>
    [expense.description, expense.merchant ?? "", expense.notes ?? "", expense.category.replace("-", " ")]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

/** "2026-10" from an ISO date. */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export type CurrencyTotal = { currency: CurrencyCode; amountMinor: number; count: number };
export type CategoryTotal = { category: CategorySlug; currency: CurrencyCode; amountMinor: number };

export type SpendingSummary = {
  month: string;
  /** One entry per currency — amounts in different currencies are never added together. */
  totals: CurrencyTotal[];
  /** Per currency, categories ordered by amount. */
  byCategory: CategoryTotal[];
};

function addSafe(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new RangeError("Total exceeds supported precision");
  return sum;
}

export function summarizeMonth(
  expenses: readonly PersonalExpense[],
  month: string,
  preferredCurrency?: CurrencyCode,
): SpendingSummary {
  const totals = new Map<CurrencyCode, CurrencyTotal>();
  const categories = new Map<string, CategoryTotal>();
  for (const expense of expenses) {
    if (expense.deletedAt || monthKey(expense.date) !== month) continue;
    const total = totals.get(expense.currency) ?? { currency: expense.currency, amountMinor: 0, count: 0 };
    total.amountMinor = addSafe(total.amountMinor, expense.amountMinor);
    total.count += 1;
    totals.set(expense.currency, total);
    const key = `${expense.currency}|${expense.category}`;
    const category = categories.get(key) ?? {
      category: expense.category,
      currency: expense.currency,
      amountMinor: 0,
    };
    category.amountMinor = addSafe(category.amountMinor, expense.amountMinor);
    categories.set(key, category);
  }
  const rank = (currency: CurrencyCode): number => (currency === preferredCurrency ? 0 : 1);
  return {
    month,
    totals: [...totals.values()].sort(
      (a, b) => rank(a.currency) - rank(b.currency) || b.amountMinor - a.amountMinor,
    ),
    byCategory: [...categories.values()].sort(
      (a, b) =>
        rank(a.currency) - rank(b.currency) ||
        a.currency.localeCompare(b.currency) ||
        b.amountMinor - a.amountMinor,
    ),
  };
}

export type MonthSection = { month: string; expenses: PersonalExpense[]; totals: CurrencyTotal[] };

/** History sections, newest month first. Input should already be sorted newest first. */
export function groupPersonalExpensesByMonth(
  expenses: readonly PersonalExpense[],
  preferredCurrency?: CurrencyCode,
): MonthSection[] {
  const sections = new Map<string, PersonalExpense[]>();
  for (const expense of expenses) {
    const key = monthKey(expense.date);
    const list = sections.get(key) ?? [];
    list.push(expense);
    sections.set(key, list);
  }
  return [...sections.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, list]) => ({
      month,
      expenses: list,
      totals: summarizeMonth(list, month, preferredCurrency).totals,
    }));
}
