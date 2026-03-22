import { supabase } from "@/lib/supabase";
import { equalSplit } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import type { Expense } from "@template/supabase";

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

  // Insert expense
  const { data: expense, error: expErr } = await supabase
    .schema("settleup")
    .from("expenses")
    .insert({
      group_id: params.groupId,
      item_name: params.itemName.trim(),
      amount_cents: params.amountCents,
      created_by_user_id: params.createdByUserId,
    })
    .select()
    .single();

  if (expErr || !expense) return { data: null, error: expErr?.message ?? "Failed to add expense" };

  // Insert payer
  const { error: payerErr } = await supabase
    .schema("settleup")
    .from("expense_payers")
    .insert({ expense_id: expense.id, member_id: params.payerMemberId, paid_cents: params.amountCents });

  if (payerErr) return { data: null, error: payerErr.message };

  // Insert participants with equal split
  const shares = equalSplit(params.amountCents, params.memberIds.length);
  const participants = params.memberIds.map((memberId, i) => ({
    expense_id: expense.id,
    member_id: memberId,
    group_id: params.groupId,
    share_cents: shares[i] ?? 0,
  }));

  const { error: partErr } = await supabase
    .schema("settleup")
    .from("expense_participants")
    .insert(participants);

  if (partErr) return { data: null, error: partErr.message };

  return { data: expense, error: null };
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
