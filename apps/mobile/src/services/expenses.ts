import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";
import {
  buildCustomExpenseRpcInput,
  buildEqualExpenseRpcInput,
  buildItemizedExpenseRpcInput,
  buildUpdateEqualExpenseRpcInput,
  buildUpdateCustomExpenseRpcInput,
  buildUpdateItemizedExpenseRpcInput,
  parseCreateExpenseRpcResult,
  type Expense,
  type ExpenseItem,
  type ExpenseItemParticipant,
  type ExpenseParticipant,
  type ExpensePayer,
} from "@template/supabase";

export type ExpenseWithDetails = Expense & {
  participants: ExpenseParticipant[];
  payers: ExpensePayer[];
  items?: (ExpenseItem & { item_participants: ExpenseItemParticipant[] })[];
};

type ExpenseWithDetailsRow = Expense & {
  participants: ExpenseParticipant[] | null;
  payers: ExpensePayer[] | null;
  items: (ExpenseItem & { item_participants: ExpenseItemParticipant[] | null })[] | null;
};

export async function addExpense(params: {
  groupId: string;
  itemName: string;
  amountCents: number;
  memberIds: string[];
  payerMemberId: string;
  createdByUserId: string;
}): Promise<ApiResponse<Expense>> {
  if (!params.itemName.trim()) return { data: null, error: "Item name is required" };
  if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
  if (params.memberIds.length === 0) return { data: null, error: "Select at least one participant" };

  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("create_expense", {
      p_input: buildEqualExpenseRpcInput({
        groupId: params.groupId,
        itemName: params.itemName,
        amountCents: params.amountCents,
        participantIds: params.memberIds,
        payers: [{ memberId: params.payerMemberId, paidCents: params.amountCents }],
      }),
    });

  if (error) return { data: null, error: error.message };

  return parseCreateExpenseRpcResult(result);
}

export async function addExpenseCustomSplit(params: {
  groupId: string;
  itemName: string;
  amountCents: number;
  customSplits: { memberId: string; shareCents: number }[];
  payers: { memberId: string; paidCents: number }[];
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
        groupId: params.groupId,
        itemName: params.itemName,
        amountCents: params.amountCents,
        customSplits: params.customSplits,
        payers: params.payers,
      }),
    });

  if (error) return { data: null, error: error.message };

  return parseCreateExpenseRpcResult(result);
}

export async function addItemizedExpense(params: {
  groupId: string;
  expenseName: string;
  amountCents: number;
  payers: { memberId: string; paidCents: number }[];
  lineItems: { name: string; amountCents: number; participantIds: string[] }[];
}): Promise<ApiResponse<Expense>> {
  if (!params.expenseName.trim()) return { data: null, error: "Expense name is required" };
  if (params.amountCents <= 0) return { data: null, error: "Amount must be positive" };
  if (params.lineItems.length === 0) return { data: null, error: "At least one line item is required" };

  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("create_itemized_expense", {
      p_input: buildItemizedExpenseRpcInput({
        groupId: params.groupId,
        itemName: params.expenseName,
        amountCents: params.amountCents,
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
        itemName: params.expenseName,
        amountCents: params.amountCents,
        payers: params.payers,
        lineItems: params.lineItems,
      }),
    });

  if (error) return { data: null, error: error.message };

  return parseCreateExpenseRpcResult(result);
}

export async function listExpenses(groupId: string): Promise<ApiResponse<ExpenseWithDetails[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("expenses")
    .select("*, participants:expense_participants(*), payers:expense_payers(*), items:expense_items(*, item_participants:expense_item_participants(*))")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return {
    data: ((data ?? []) as ExpenseWithDetailsRow[]).map((expense) => ({
      ...expense,
      participants: expense.participants ?? [],
      payers: expense.payers ?? [],
      items: (expense.items ?? []).map((item) => ({
        ...item,
        item_participants: item.item_participants ?? [],
      })),
    })),
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
