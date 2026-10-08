import { supabase } from "@/lib/supabase";
import type { ApiResponse, CurrencyCode } from "@template/shared";

export type RecurringExpense = {
  id: string;
  group_id: string;
  item_name: string;
  amount_cents: number;
  currency_code: CurrencyCode;
  category_id: string | null;
  payer_member_id: string;
  participant_member_ids: string[];
  cadence: string;
  next_run_at: string;
  active: boolean;
  payers: { member_id: string; paid_cents: number }[] | null;
  /** Null once the creator closed their account: only admins manage it then. */
  created_by_user_id: string | null;
};

export type CreateRecurringParams = {
  groupId: string;
  itemName: string;
  amountCents: number;
  /** Future expenses are created in this currency. */
  currencyCode: CurrencyCode;
  categoryId: string | null;
  payers: { memberId: string; paidCents: number }[];
  participantMemberIds: string[];
  cadence: "weekly" | "monthly";
  createdByUserId: string;
};

export async function listRecurringExpenses(groupId: string): Promise<ApiResponse<RecurringExpense[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("recurring_expenses")
    .select("id, group_id, item_name, amount_cents, currency_code, category_id, payer_member_id, participant_member_ids, cadence, next_run_at, active, payers, created_by_user_id")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as RecurringExpense[], error: null };
}

export async function createRecurringExpense(params: CreateRecurringParams): Promise<ApiResponse<null>> {
  const firstPayer = params.payers[0];
  if (!firstPayer) return { data: null, error: "At least one payer is required" };
  if (params.payers.length > 20) return { data: null, error: "Too many payers" };
  const payerSum = params.payers.reduce((sum, p) => sum + p.paidCents, 0);
  if (payerSum !== params.amountCents) {
    return { data: null, error: "Payer total must equal the expense amount" };
  }

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
      currency_code: params.currencyCode,
      category_id: params.categoryId,
      payer_member_id: firstPayer.memberId,
      participant_member_ids: params.participantMemberIds,
      cadence: params.cadence,
      next_run_at: next.toISOString().slice(0, 10),
      payers:
        params.payers.length > 1
          ? params.payers.map((p) => ({ member_id: p.memberId, paid_cents: p.paidCents }))
          : null,
      created_by_user_id: params.createdByUserId,
    });

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

const RECURRING_FORBIDDEN = "Only the person who set this up or a group admin can change it.";

/**
 * Why an update or delete touched no row: RLS hides rows you may not change,
 * and the row may simply be gone. Deleting something already gone is fine.
 */
async function zeroRowsReason(id: string, action: "update" | "delete"): Promise<string | null> {
  const { data } = await supabase.schema("settleup").from("recurring_expenses").select("id").eq("id", id).maybeSingle();
  if (data) return RECURRING_FORBIDDEN;
  return action === "delete" ? null : "This recurring expense no longer exists.";
}

export async function setRecurringExpenseActive(id: string, active: boolean): Promise<ApiResponse<null>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("recurring_expenses")
    .update({ active })
    .eq("id", id)
    .select("id");

  if (error) return { data: null, error: error.message };
  if (!data || data.length === 0) {
    return { data: null, error: (await zeroRowsReason(id, "update")) ?? "This recurring expense no longer exists." };
  }
  return { data: null, error: null };
}

export async function deleteRecurringExpense(id: string): Promise<ApiResponse<null>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("recurring_expenses")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return { data: null, error: error.message };
  if (!data || data.length === 0) {
    // Already gone counts as deleted.
    const reason = await zeroRowsReason(id, "delete");
    if (reason) return { data: null, error: reason };
  }
  return { data: null, error: null };
}
