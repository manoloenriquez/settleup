import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";
import { computeGroupInsights, type GroupInsights } from "@/lib/insights-utils";

export type { GroupInsights } from "@/lib/insights-utils";

export async function getGroupInsights(groupId: string): Promise<ApiResponse<GroupInsights>> {
  const { data: expenses, error } = await supabase
    .schema("settleup")
    .from("expenses")
    .select("item_name, amount_cents, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message };

  return { data: computeGroupInsights(expenses ?? []), error: null };
}
