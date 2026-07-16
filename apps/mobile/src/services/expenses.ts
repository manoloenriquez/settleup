import { supabase } from "@/lib/supabase";
import { API_LIMITS } from "@template/shared";
import type { ApiResponse, PaginatedResponse } from "@template/shared";
import {
  buildCustomExpenseRpcInput,
  buildEqualExpenseRpcInput,
  buildItemizedExpenseRpcInput,
  buildUpdateEqualExpenseRpcInput,
  buildUpdateCustomExpenseRpcInput,
  buildUpdateItemizedExpenseRpcInput,
  parseCreateExpenseRpcResult,
  type Expense,
  type ExpenseCategory,
  type ExpenseItem,
  type ExpenseItemParticipant,
  type ExpenseParticipant,
  type ExpensePayer,
} from "@template/supabase";

export type ExpenseWithDetails = Expense & {
  category: ExpenseCategory | null;
  participants: ExpenseParticipant[];
  payers: ExpensePayer[];
  items?: (ExpenseItem & { item_participants: ExpenseItemParticipant[] })[];
};

type ExpenseWithDetailsRow = Expense & {
  category: ExpenseCategory | null;
  participants: ExpenseParticipant[] | null;
  payers: ExpensePayer[] | null;
  items: (ExpenseItem & { item_participants: ExpenseItemParticipant[] | null })[] | null;
};

export async function addExpense(params: {
  /** Client-generated UUID: idempotency key for offline/flaky-network replays. */
  clientId?: string;
  groupId: string;
  itemName: string;
  amountCents: number;
  categoryId?: string | null;
  memberIds: string[];
  payerMemberId: string;
  createdByUserId: string;
  expenseDate?: string;
}): Promise<ApiResponse<Expense>> {
  if (!params.itemName.trim()) return { data: null, error: "Item name is required" };
  if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
  if (params.memberIds.length === 0) return { data: null, error: "Select at least one participant" };

  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("create_expense", {
      p_input: buildEqualExpenseRpcInput({
        clientId: params.clientId,
        groupId: params.groupId,
        categoryId: params.categoryId,
        itemName: params.itemName,
        amountCents: params.amountCents,
        expenseDate: params.expenseDate,
        participantIds: params.memberIds,
        payers: [{ memberId: params.payerMemberId, paidCents: params.amountCents }],
      }),
    });

  if (error) return { data: null, error: error.message };

  return parseCreateExpenseRpcResult(result);
}

export async function addExpenseCustomSplit(params: {
  /** Client-generated UUID: idempotency key for offline/flaky-network replays. */
  clientId?: string;
  groupId: string;
  itemName: string;
  amountCents: number;
  categoryId?: string | null;
  customSplits: { memberId: string; shareCents: number }[];
  payers: { memberId: string; paidCents: number }[];
  expenseDate?: string;
}): Promise<ApiResponse<Expense>> {
  if (!params.itemName.trim()) return { data: null, error: "Item name is required" };
  if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
  if (params.customSplits.length === 0) return { data: null, error: "Select at least one participant" };

  const splitSum = params.customSplits.reduce((s, p) => s + p.shareCents, 0);
  if (splitSum !== params.amountCents) {
    return { data: null, error: `Split total (${splitSum}) must equal amount (${params.amountCents})` };
  }

  const payerSum = params.payers.reduce((s, p) => s + p.paidCents, 0);
  if (payerSum !== params.amountCents) {
    return { data: null, error: `Payer total (${payerSum}) must equal amount (${params.amountCents})` };
  }

  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("create_expense", {
      p_input: buildCustomExpenseRpcInput({
        clientId: params.clientId,
        groupId: params.groupId,
        categoryId: params.categoryId,
        itemName: params.itemName,
        amountCents: params.amountCents,
        expenseDate: params.expenseDate,
        customSplits: params.customSplits,
        payers: params.payers,
      }),
    });

  if (error) return { data: null, error: error.message };

  return parseCreateExpenseRpcResult(result);
}

export async function addItemizedExpense(params: {
  /** Client-generated UUID: idempotency key for offline/flaky-network replays. */
  clientId?: string;
  groupId: string;
  expenseName: string;
  amountCents: number;
  categoryId?: string | null;
  payers: { memberId: string; paidCents: number }[];
  lineItems: { name: string; amountCents: number; participantIds: string[] }[];
  expenseDate?: string;
}): Promise<ApiResponse<Expense>> {
  if (!params.expenseName.trim()) return { data: null, error: "Expense name is required" };
  if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
  if (params.lineItems.length === 0) return { data: null, error: "At least one line item is required" };

  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("create_itemized_expense", {
      p_input: buildItemizedExpenseRpcInput({
        clientId: params.clientId,
        groupId: params.groupId,
        categoryId: params.categoryId,
        itemName: params.expenseName,
        amountCents: params.amountCents,
        expenseDate: params.expenseDate,
        payers: params.payers,
        lineItems: params.lineItems,
      }),
    });

  if (error) return { data: null, error: error.message };

  return parseCreateExpenseRpcResult(result);
}

export async function updateExpense(params: {
  expenseId: string;
  itemName: string;
  amountCents: number;
  categoryId?: string | null;
  participantIds: string[];
  payers: { memberId: string; paidCents: number }[];
}): Promise<ApiResponse<Expense>> {
  if (!params.itemName.trim()) return { data: null, error: "Item name is required" };
  if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
  if (params.participantIds.length === 0) return { data: null, error: "Select at least one participant" };

  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("update_expense", {
      p_input: buildUpdateEqualExpenseRpcInput({
        expenseId: params.expenseId,
        categoryId: params.categoryId,
        itemName: params.itemName,
        amountCents: params.amountCents,
        participantIds: params.participantIds,
        payers: params.payers,
      }),
    });

  if (error) return { data: null, error: error.message };

  return parseCreateExpenseRpcResult(result);
}

export async function updateExpenseCustomSplit(params: {
  expenseId: string;
  itemName: string;
  amountCents: number;
  categoryId?: string | null;
  customSplits: { memberId: string; shareCents: number }[];
  payers: { memberId: string; paidCents: number }[];
}): Promise<ApiResponse<Expense>> {
  if (!params.itemName.trim()) return { data: null, error: "Item name is required" };
  if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };

  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("update_expense", {
      p_input: buildUpdateCustomExpenseRpcInput({
        expenseId: params.expenseId,
        categoryId: params.categoryId,
        itemName: params.itemName,
        amountCents: params.amountCents,
        customSplits: params.customSplits,
        payers: params.payers,
      }),
    });

  if (error) return { data: null, error: error.message };

  return parseCreateExpenseRpcResult(result);
}

export async function updateItemizedExpense(params: {
  expenseId: string;
  expenseName: string;
  amountCents: number;
  categoryId?: string | null;
  payers: { memberId: string; paidCents: number }[];
  lineItems: { name: string; amountCents: number; participantIds: string[] }[];
}): Promise<ApiResponse<Expense>> {
  if (!params.expenseName.trim()) return { data: null, error: "Expense name is required" };
  if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
  if (params.lineItems.length === 0) return { data: null, error: "At least one line item is required" };

  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("update_itemized_expense", {
      p_input: buildUpdateItemizedExpenseRpcInput({
        expenseId: params.expenseId,
        categoryId: params.categoryId,
        itemName: params.expenseName,
        amountCents: params.amountCents,
        payers: params.payers,
        lineItems: params.lineItems,
      }),
    });

  if (error) return { data: null, error: error.message };

  return parseCreateExpenseRpcResult(result);
}

export async function listExpenses(
  groupId: string,
  page = 1,
  pageSize: number = API_LIMITS.EXPENSES_PAGE_SIZE,
): Promise<ApiResponse<PaginatedResponse<ExpenseWithDetails>>> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(Math.max(1, Math.floor(pageSize)), API_LIMITS.MAX_PAGE_SIZE);
  const from = (safePage - 1) * safePageSize;

  const { data, error, count } = await supabase
    .schema("settleup")
    .from("expenses")
    .select("*, category:expense_categories(*), participants:expense_participants(*), payers:expense_payers(*), items:expense_items(*, item_participants:expense_item_participants(*))", { count: "exact" })
    .eq("group_id", groupId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + safePageSize - 1);

  if (error) return { data: null, error: error.message };
  const total = count ?? 0;
  return {
    data: {
      data: ((data ?? []) as ExpenseWithDetailsRow[]).map((expense) => ({
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

/** Lightweight all-rows totals so headers/budgets stay correct under pagination. */
export async function listExpenseTotals(
  groupId: string,
): Promise<ApiResponse<{ count: number; positiveTotalCents: number }>> {
  const { data, error, count } = await supabase
    .schema("settleup")
    .from("expenses")
    .select("amount_cents", { count: "exact" })
    .eq("group_id", groupId);

  if (error) return { data: null, error: error.message };
  return {
    data: {
      count: count ?? 0,
      positiveTotalCents: (data ?? []).reduce((sum, e) => sum + Math.max(0, e.amount_cents), 0),
    },
    error: null,
  };
}

export async function deleteExpense(expenseId: string): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .schema("settleup")
    .from("expenses")
    .delete()
    .eq("id", expenseId);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}
