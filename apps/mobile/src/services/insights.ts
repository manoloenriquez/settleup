import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";

export type GroupInsights = {
  total_expenses: number;
  total_amount_cents: number;
  average_expense_cents: number;
  top_item?: string;
  period_days: number;
};

export async function getGroupInsights(groupId: string): Promise<ApiResponse<GroupInsights>> {
  const { data: expenses, error } = await supabase
    .schema("settleup")
    .from("expenses")
    .select("item_name, amount_cents, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message };
  if (!expenses || expenses.length === 0) {
    return { data: { total_expenses: 0, total_amount_cents: 0, average_expense_cents: 0, period_days: 0 }, error: null };
  }

  const total = expenses.reduce((sum, e) => sum + e.amount_cents, 0);
  const first = expenses[0]?.created_at ? new Date(expenses[0].created_at) : new Date();
  const last = expenses[expenses.length - 1]?.created_at ? new Date(expenses[expenses.length - 1]!.created_at) : new Date();
  const periodDays = Math.max(1, Math.ceil((last.getTime() - first.getTime()) / 86400000));

  // Count item name frequency
  const nameCount = new Map<string, number>();
  for (const e of expenses) {
    nameCount.set(e.item_name, (nameCount.get(e.item_name) ?? 0) + 1);
  }
  const topItem = [...nameCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    data: {
      total_expenses: expenses.length,
      total_amount_cents: total,
      average_expense_cents: Math.round(total / expenses.length),
      top_item: topItem,
      period_days: periodDays,
    },
    error: null,
  };
}
