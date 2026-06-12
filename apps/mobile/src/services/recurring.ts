import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";

export type RecurringExpense = {
  id: string;
  group_id: string;
  item_name: string;
  amount_cents: number;
  category_id: string | null;
  payer_member_id: string;
  participant_member_ids: string[];
  cadence: string;
  next_run_at: string;
  active: boolean;
};

export type CreateRecurringParams = {
  groupId: string;
  itemName: string;
  amountCents: number;
  categoryId: string | null;
  payerMemberId: string;
  participantMemberIds: string[];
  cadence: "weekly" | "monthly";
  createdByUserId: string;
};

export async function listRecurringExpenses(groupId: string): Promise<ApiResponse<RecurringExpense[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("recurring_expenses")
    .select("id, group_id, item_name, amount_cents, category_id, payer_member_id, participant_member_ids, cadence, next_run_at, active")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as RecurringExpense[], error: null };
}

export async function createRecurringExpense(params: CreateRecurringParams): Promise<ApiResponse<null>> {
  const next = new Date();
  if (params.cadence === "weekly") next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);

  const { error } = await supabase
    .schema("settleup")
    .from("recurring_expenses")
    .insert({
      group_id: params.groupId,
      item_name: params.itemName,
      amount_cents: params.amountCents,
      category_id: params.categoryId,
      payer_member_id: params.payerMemberId,
      participant_member_ids: params.participantMemberIds,
      cadence: params.cadence,
      next_run_at: next.toISOString().slice(0, 10),
      created_by_user_id: params.createdByUserId,
    });

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

export async function setRecurringExpenseActive(id: string, active: boolean): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .schema("settleup")
    .from("recurring_expenses")
    .update({ active })
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

export async function deleteRecurringExpense(id: string): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .schema("settleup")
    .from("recurring_expenses")
    .delete()
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}
