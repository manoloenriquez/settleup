import { supabase } from "@/lib/supabase/client";
import { API_LIMITS } from "@template/shared";
import type { ApiResponse, PaginatedResponse } from "@template/shared";
import type { ExpenseSummary, ExpenseWithParticipants } from "@/app/actions/expenses";

type ExpenseWithParticipantsRow = Omit<ExpenseWithParticipants, "participants" | "payers" | "items"> & {
  participants: ExpenseWithParticipants["participants"] | null;
  payers: ExpenseWithParticipants["payers"] | null;
  items:
    | (NonNullable<ExpenseWithParticipants["items"]>[number] & {
        item_participants: NonNullable<ExpenseWithParticipants["items"]>[number]["item_participants"] | null;
      })[]
    | null;
};

export async function listExpenses(
  groupId: string,
  page = 1,
  pageSize: number = API_LIMITS.EXPENSES_PAGE_SIZE,
): Promise<ApiResponse<PaginatedResponse<ExpenseWithParticipants>>> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(Math.max(1, Math.floor(pageSize)), API_LIMITS.MAX_PAGE_SIZE);
  const from = (safePage - 1) * safePageSize;

  const { data: expenses, error, count } = await supabase
    .schema("settleup")
    .from("expenses")
    .select("*, category:expense_categories(*), participants:expense_participants(*), payers:expense_payers(*), items:expense_items(*, item_participants:expense_item_participants(*))", { count: "exact" })
    .eq("group_id", groupId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + safePageSize - 1);

  if (error) return { data: null, error: "Failed to load expenses." };

  const total = count ?? 0;
  return {
    data: {
      data: ((expenses ?? []) as unknown as ExpenseWithParticipantsRow[]).map((expense) => ({
        ...expense,
        participants: expense.participants ?? [],
        payers: expense.payers ?? [],
        items: (expense.items ?? []).map((item) => ({
          ...item,
          item_participants: item.item_participants ?? [],
        })),
      })),
      count: total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize),
    },
    error: null,
  };
}

/** Lightweight, unpaginated projection powering totals, budget, and charts. */
export async function listExpenseSummaries(groupId: string): Promise<ApiResponse<ExpenseSummary[]>> {
  const { data: rows, error } = await supabase
    .schema("settleup")
    .from("expenses")
    .select("id, item_name, amount_cents, expense_date, created_at, category:expense_categories(*), payers:expense_payers(member_id, paid_cents), participants:expense_participants(member_id, share_cents)")
    .eq("group_id", groupId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: "Failed to load expense summaries." };

  type SummaryRow = Omit<ExpenseSummary, "payers" | "participants"> & {
    payers: ExpenseSummary["payers"] | null;
    participants: ExpenseSummary["participants"] | null;
  };

  return {
    data: ((rows ?? []) as unknown as SummaryRow[]).map((row) => ({
      ...row,
      payers: row.payers ?? [],
      participants: row.participants ?? [],
    })),
    error: null,
  };
}
