import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";
import {
  buildCustomExpenseRpcInput,
  buildEqualExpenseRpcInput,
  buildItemizedExpenseRpcInput,
  parseCreateExpenseRpcResult,
  type Expense,
} from "@template/supabase";

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

export async function listExpenses(groupId: string): Promise<ApiResponse<Expense[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("expenses")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
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
