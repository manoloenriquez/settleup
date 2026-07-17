import { useMemo } from "react";
import type { OutboxEntry, OutboxEntryStatus } from "@template/shared";
import { useOutbox } from "@/context/OutboxContext";

// ---------------------------------------------------------------------------
// Render-time merge helpers: the React Query cache stays pure server data;
// pending rows are derived from outbox entries at render time. No optimistic
// rows are ever written into the query cache, so a crash can't corrupt it.
// ---------------------------------------------------------------------------

export type PendingExpenseRow = {
  id: string;
  item_name: string;
  amount_cents: number;
  expense_date: string | null;
  status: OutboxEntryStatus;
};

export type PendingPaymentRow = {
  id: string;
  amount_cents: number;
  status: OutboxEntryStatus;
};

const EXPENSE_CREATE_KINDS = new Set(["expense.create", "expense.create_itemized"]);

function payloadExpenseDate(entry: OutboxEntry): string | null {
  if (entry.payload !== null && typeof entry.payload === "object" && !Array.isArray(entry.payload)) {
    const value = entry.payload["expense_date"];
    if (typeof value === "string") return value;
  }
  return null;
}

/** Locally created expenses in this group that have not synced yet. */
export function usePendingExpenses(groupId: string): PendingExpenseRow[] {
  const { entries } = useOutbox();
  return useMemo(
    () =>
      entries
        .filter((e) => e.groupId === groupId && EXPENSE_CREATE_KINDS.has(e.kind))
        .map((e) => ({
          id: e.id,
          item_name: e.summary.title,
          amount_cents: e.summary.amountCents,
          expense_date: payloadExpenseDate(e),
          status: e.status,
        })),
    [entries, groupId],
  );
}

/** Locally recorded settle-up payments in this group that have not synced yet. */
export function usePendingPaymentRecords(groupId: string): PendingPaymentRow[] {
  const { entries } = useOutbox();
  return useMemo(
    () =>
      entries
        .filter((e) => e.groupId === groupId && e.kind === "payment.record")
        .map((e) => ({ id: e.id, amount_cents: e.summary.amountCents, status: e.status })),
    [entries, groupId],
  );
}

/** Total queued changes (for the offline banner) and failed count. */
export function usePendingCounts(): { pending: number; failed: number } {
  const { entries } = useOutbox();
  return useMemo(
    () => ({
      pending: entries.length,
      failed: entries.filter((e) => e.status === "failed").length,
    }),
    [entries],
  );
}
