import { supabase } from "@/lib/supabase";
import type { ApiResponse, CurrencyCode } from "@template/shared";
import { computeGroupInsights, type GroupInsights } from "@/lib/insights-utils";

export type { GroupInsights } from "@/lib/insights-utils";

/** Insights in one currency: totals and averages never mix currencies. */
export async function getGroupInsights(
  groupId: string,
  currency: CurrencyCode,
): Promise<ApiResponse<GroupInsights>> {
  const { data: expenses, error } = await supabase
    .schema("settleup")
    .from("expenses")
    .select("item_name, amount_cents, created_at, category:expense_categories(name, slug, color)")
    .eq("group_id", groupId)
    .eq("currency_code", currency)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message };

  return { data: computeGroupInsights(expenses ?? []), error: null };
}
