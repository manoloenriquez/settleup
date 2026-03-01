"use server";

import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import type { ApiResponse, GroupWithStats } from "@template/shared/types";

export type DashboardSummary = {
  net_balance_cents: number; // positive = owed to you, negative = you owe
  total_groups: number;
  total_unsettled_cents: number;
  pending_members: number;
  groups: {
    id: string;
    name: string;
    member_count: number;
    pending_count: number;
    total_owed_cents: number;
    created_at: string;
  }[];
};

type BalanceRow = {
  member_id: string;
  display_name: string;
  net_cents: number;
  user_id: string | null;
};

export async function getDashboardSummary(): Promise<ApiResponse<DashboardSummary>> {
  try {
    const user = await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data, error } = await db.rpc("get_groups_with_stats");
    if (error) return { data: null, error: error.message };

    const groups = (data ?? []) as unknown as GroupWithStats[];

    const totalGroups = groups.length;
    const totalUnsettled = groups.reduce((sum, g) => sum + g.total_owed_cents, 0);
    const pendingMembers = groups.reduce((sum, g) => sum + g.pending_count, 0);

    // Calculate net balance across groups for current user
    let netBalance = 0;
    for (const group of groups) {
      const { data: balanceData } = await db.rpc("get_member_balances", {
        p_group_id: group.id,
      });
      if (balanceData) {
        const balances = (balanceData ?? []) as unknown as BalanceRow[];
        const myBalance = balances.find((b) => b.user_id === user.id);
        if (myBalance) {
          netBalance += myBalance.net_cents;
        }
      }
    }

    return {
      data: {
        net_balance_cents: netBalance,
        total_groups: totalGroups,
        total_unsettled_cents: totalUnsettled,
        pending_members: pendingMembers,
        groups: groups.map((g) => ({
          id: g.id,
          name: g.name,
          member_count: g.member_count,
          pending_count: g.pending_count,
          total_owed_cents: g.total_owed_cents,
          created_at: g.created_at,
        })),
      },
      error: null,
    };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
