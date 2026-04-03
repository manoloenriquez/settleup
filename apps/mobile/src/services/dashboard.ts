import { supabase } from "@/lib/supabase";
import { aggregateBalances } from "@/lib/dashboard-utils";
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

  const allBalances: { net_cents: number }[] = [];

  for (const g of groups ?? []) {
    const { data: rawBalances } = await supabase
      .schema("settleup")
      .rpc("get_member_balances", { p_group_id: g.id });

    allBalances.push(...((rawBalances as unknown as { net_cents: number }[]) ?? []));
  }

  const { total_owed_cents, total_receivable_cents, net_cents } = aggregateBalances(allBalances);

  return {
    data: {
      total_groups: (groups ?? []).length,
      total_owed_cents,
      total_receivable_cents,
      net_cents,
    },
    error: null,
  };
}
