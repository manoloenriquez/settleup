import { z } from "zod";
import { currencyCodeSchema } from "./currency";
import { CATEGORY_SLUGS } from "./category";
import { personalExpenseSourceSchema } from "../schemas/personal";
import type { PersonalExpense, PersonalLedgerState } from "../types/personal";

// ---------------------------------------------------------------------------
// Sync protocol between the on-device personal ledger and
// settleup.personal_expenses.
//
// Conflict rule (server-side, see migration 20261001100000): the last write to
// ARRIVE wins; device clocks are never compared. A deletion is never undone by
// a device that has not seen it — only a device whose base version is the
// deletion itself (an Undo) can restore the row.
// ---------------------------------------------------------------------------

/** One row as the server stores and returns it. */
export const serverPersonalExpenseSchema = z.object({
  id: z.uuid(),
  description: z.string(),
  amount_minor: z.number().int(),
  currency_code: currencyCodeSchema,
  category_slug: z.enum(CATEGORY_SLUGS),
  expense_date: z.string(),
  notes: z.string().nullable(),
  merchant: z.string().nullable(),
  source: personalExpenseSourceSchema,
  client_created_at: z.string(),
  client_updated_at: z.string(),
  deleted_at: z.string().nullable(),
  updated_at: z.string(),
});
export type ServerPersonalExpense = z.infer<typeof serverPersonalExpenseSchema>;

export const pushResultSchema = z.object({
  id: z.uuid(),
  status: z.enum(["applied", "kept_server", "rejected"]),
  row: serverPersonalExpenseSchema.nullable(),
});
export type PushResult = z.infer<typeof pushResultSchema>;

/** Payload row for upsert_personal_expenses. */
export type PushRow = {
  id: string;
  description: string;
  amount_minor: number;
  currency_code: string;
  category_slug: string;
  expense_date: string;
  notes: string | null;
  merchant: string | null;
  source: string;
  client_created_at: string;
  client_updated_at: string;
  deleted: boolean;
  /** The server version this edit was made on top of, if any. */
  base_updated_at: string | null;
};

export function toPushRow(expense: PersonalExpense): PushRow {
  return {
    id: expense.id,
    description: expense.description,
    amount_minor: expense.amountMinor,
    currency_code: expense.currency,
    category_slug: expense.category,
    expense_date: expense.date,
    notes: expense.notes,
    merchant: expense.merchant,
    source: expense.source,
    client_created_at: expense.createdAt,
    client_updated_at: expense.updatedAt,
    deleted: expense.deletedAt !== null,
    base_updated_at: expense.serverUpdatedAt,
  };
}

export function fromServerRow(row: ServerPersonalExpense): PersonalExpense {
  return {
    id: row.id,
    description: row.description,
    amountMinor: row.amount_minor,
    currency: row.currency_code,
    category: row.category_slug,
    date: row.expense_date,
    notes: row.notes,
    merchant: row.merchant,
    source: row.source,
    createdAt: row.client_created_at,
    updatedAt: row.client_updated_at,
    deletedAt: row.deleted_at,
    sync: "synced",
    serverUpdatedAt: row.updated_at,
  };
}

/** Records waiting to upload, oldest change first. */
export function pendingPersonalExpenses(state: PersonalLedgerState, limit = 50): PersonalExpense[] {
  return state.expenses
    .filter((expense) => expense.sync === "pending")
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .slice(0, limit);
}

/**
 * Apply the server's answer to a push. `sent` are the exact versions that
 * were uploaded: a record edited again while the request was in flight stays
 * pending (with the new base) so the newer edit is uploaded next.
 */
export function applyPushResults(
  state: PersonalLedgerState,
  sent: readonly PersonalExpense[],
  results: readonly PushResult[],
): PersonalLedgerState {
  const sentById = new Map(sent.map((expense) => [expense.id, expense]));
  const resultById = new Map(results.map((result) => [result.id, result]));
  const expenses = state.expenses.map((expense) => {
    const result = resultById.get(expense.id);
    const sentVersion = sentById.get(expense.id);
    if (!result || !sentVersion) return expense;
    const unchangedSinceSend = expense.updatedAt === sentVersion.updatedAt && expense.sync === "pending";
    if (result.status === "rejected" || !result.row) {
      // The id belongs to someone else (a UUID collision). Keep the record on
      // this device and stop retrying it.
      return unchangedSinceSend ? { ...expense, sync: "local" as const } : expense;
    }
    if (result.status === "kept_server") {
      // The server kept a newer or deleted version; the device adopts it.
      return unchangedSinceSend ? fromServerRow(result.row) : { ...expense, serverUpdatedAt: result.row.updated_at };
    }
    return unchangedSinceSend
      ? { ...expense, sync: "synced" as const, serverUpdatedAt: result.row.updated_at }
      : { ...expense, serverUpdatedAt: result.row.updated_at };
  });
  return { ...state, expenses };
}

/**
 * Merge rows pulled from the server. Local edits that have not been uploaded
 * win on the device (they upload next and win on the server by arriving
 * later); everything else takes the server's version.
 */
export function mergePulledRows(
  state: PersonalLedgerState,
  rows: readonly ServerPersonalExpense[],
): PersonalLedgerState {
  const byId = new Map(state.expenses.map((expense) => [expense.id, expense]));
  for (const row of rows) {
    const local = byId.get(row.id);
    if (local && local.sync === "pending") continue;
    if (local && local.serverUpdatedAt && local.serverUpdatedAt >= row.updated_at) continue;
    byId.set(row.id, fromServerRow(row));
  }
  let cursor = state.pullCursor ?? null;
  for (const row of rows) if (!cursor || row.updated_at > cursor) cursor = row.updated_at;
  return { ...state, expenses: [...byId.values()], pullCursor: cursor };
}

/** Where the next pull starts: the newest version a previous pull returned. */
export function pullCursor(state: PersonalLedgerState): string | null {
  return state.pullCursor ?? null;
}

// ---------------------------------------------------------------------------
// Guest → account import
// ---------------------------------------------------------------------------

/** Guest expenses (including deletions) that the account store does not have yet. */
export function unimportedGuestExpenses(
  guest: PersonalLedgerState,
  account: PersonalLedgerState,
): PersonalExpense[] {
  const known = new Set(account.expenses.map((expense) => expense.id));
  return guest.expenses.filter((expense) => !known.has(expense.id) && !expense.deletedAt);
}

/**
 * Copy guest expenses into the account store as pending uploads. Ids are
 * kept, so repeating the import (after a crash or a retry) never duplicates.
 */
export function importGuestExpenses(
  account: PersonalLedgerState,
  guest: PersonalLedgerState,
): PersonalLedgerState {
  const additions = unimportedGuestExpenses(guest, account).map((expense) => ({
    ...expense,
    sync: "pending" as const,
    serverUpdatedAt: null,
  }));
  return { ...account, expenses: [...account.expenses, ...additions] };
}

/**
 * The guest copy may be removed only when every live guest expense exists in
 * the account store AND the server has acknowledged it.
 */
export function guestImportComplete(guest: PersonalLedgerState, account: PersonalLedgerState): boolean {
  const accountById = new Map(account.expenses.map((expense) => [expense.id, expense]));
  return guest.expenses
    .filter((expense) => !expense.deletedAt)
    .every((expense) => {
      const imported = accountById.get(expense.id);
      return imported !== undefined && imported.sync === "synced";
    });
}
