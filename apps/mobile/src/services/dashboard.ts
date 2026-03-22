import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";

export type DashboardSummary = {
  total_groups: number;
  total_owed_cents: number; // sum across all groups where user owes
  total_receivable_cents: number; // sum across all groups where user is owed
  net_cents: number; // positive = owed to me, negative = I owe
};

export async function getDashboardSummary(userId: string): Promise<ApiResponse<DashboardSummary>> {
  // Get all groups user is part of (as owner)
  const { data: groups, error: groupsErr } = await supabase
    .schema("settleup")
    .from("groups")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("is_archived", false);

  if (groupsErr) return { data: null, error: groupsErr.message };

  const summary: DashboardSummary = {
    total_groups: (groups ?? []).length,
    total_owed_cents: 0,
    total_receivable_cents: 0,
    net_cents: 0,
  };

  // Aggregate balances across all groups
  for (const g of groups ?? []) {
    const { data: rawBalances } = await supabase
      .schema("settleup")
      .rpc("get_member_balances", { p_group_id: g.id });

    for (const b of (rawBalances as unknown as { net_cents: number }[]) ?? []) {
      if (b.net_cents > 0) summary.total_receivable_cents += b.net_cents;
      else summary.total_owed_cents += Math.abs(b.net_cents);
    }
  }

  summary.net_cents = summary.total_receivable_cents - summary.total_owed_cents;
  return { data: summary, error: null };
}
