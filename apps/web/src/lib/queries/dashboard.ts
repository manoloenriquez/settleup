import { supabase } from "@/lib/supabase/client";
import type { ApiResponse, CurrencyCode, DashboardSummary } from "@template/shared";
import { parseDashboardSummaryRpcResult } from "@template/supabase";
import { getMyCurrencies } from "@/lib/queries/currency";

/** One summary per currency used in my groups; amounts are never combined. */
export async function getDashboardSummaries(): Promise<ApiResponse<DashboardSummary[]>> {
  const currencies = await getMyCurrencies();
  if (currencies.error !== null) return { data: null, error: currencies.error };
  const results = await Promise.all(
    currencies.data.map(async (currency: CurrencyCode): Promise<ApiResponse<DashboardSummary>> => {
      const { data, error } = await supabase
        .schema("settleup")
        .rpc("get_dashboard_summary_v2", { p_currency_code: currency });
      if (error) return { data: null, error: "Failed to load dashboard." };
      const parsed = parseDashboardSummaryRpcResult(data);
      if (parsed.error !== null) return { data: null, error: parsed.error };
      return { data: { ...parsed.data, currency_code: currency }, error: null };
    }),
  );
  const summaries: DashboardSummary[] = [];
  for (const result of results) {
    if (result.error !== null) return { data: null, error: result.error };
    summaries.push(result.data);
  }
  return { data: summaries, error: null };
}
