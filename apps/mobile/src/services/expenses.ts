import { supabase } from "@/lib/supabase";
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

  const { data: result, error } = await supabase
    .schema("settleup")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .rpc("create_expense" as any, {
      p_input: {
        group_id: params.groupId,
        item_name: params.itemName.trim(),
        amount_cents: params.amountCents,
        split_mode: "equal",
        participant_ids: [...params.memberIds].sort(),
        payers: [{ member_id: params.payerMemberId, paid_cents: params.amountCents }],
      },
    });

  if (error) return { data: null, error: error.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expense = (result as any)?.expense as Expense;
  if (!expense) return { data: null, error: "Failed to add expense" };

  return { data: expense, error: null };
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .rpc("create_expense" as any, {
      p_input: {
        group_id: params.groupId,
        item_name: params.itemName.trim(),
        amount_cents: params.amountCents,
        split_mode: "custom",
        custom_splits: params.customSplits.map((s) => ({
          member_id: s.memberId,
          share_cents: s.shareCents,
        })),
        payers: params.payers.map((p) => ({
          member_id: p.memberId,
          paid_cents: p.paidCents,
        })),
      },
    });

  if (error) return { data: null, error: error.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expense = (result as any)?.expense as Expense;
  if (!expense) return { data: null, error: "Failed to add expense" };

  return { data: expense, error: null };
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .rpc("create_itemized_expense" as any, {
      p_input: {
        group_id: params.groupId,
        item_name: params.expenseName.trim(),
        amount_cents: params.amountCents,
        payers: params.payers.map((p) => ({
          member_id: p.memberId,
          paid_cents: p.paidCents,
        })),
        line_items: params.lineItems.map((li) => ({
          name: li.name,
          amount_cents: li.amountCents,
          participant_ids: [...li.participantIds].sort(),
        })),
      },
    });

  if (error) return { data: null, error: error.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expense = (result as any)?.expense as Expense;
  if (!expense) return { data: null, error: "Failed to add expense" };

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
