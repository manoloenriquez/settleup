import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";
import { mergeAndSortActivity, type ActivityItem } from "@/lib/activity-utils";

export type { ActivityItem } from "@/lib/activity-utils";

export async function getGroupActivity(groupId: string): Promise<ApiResponse<ActivityItem[]>> {
  const [expensesRes, paymentsRes] = await Promise.all([
    supabase
      .schema("settleup")
      .from("expenses")
      .select("id, item_name, amount_cents, created_at, category:expense_categories(id, name, slug, icon, color, is_default)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .schema("settleup")
      .from("payments")
      .select("id, amount_cents, created_at, from_member_id")
      .eq("group_id", groupId)
      .eq("status", "PAID")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return { data: mergeAndSortActivity(expensesRes.data ?? [], paymentsRes.data ?? []), error: null };
}
