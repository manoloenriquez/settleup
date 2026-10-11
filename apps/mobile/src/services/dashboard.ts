import { supabase } from "@/lib/supabase";
import type { ApiResponse, CurrencyCode, DashboardSummary } from "@template/shared";
import { parseDashboardSummaryRpcResult } from "@template/supabase";
import { getMyCurrencies } from "@/services/currency";

/** One summary per currency used in my groups; amounts are never combined. */
export async function getDashboardSummaries(): Promise<ApiResponse<DashboardSummary[]>> {
  const currencies = await getMyCurrencies();
  if (currencies.error !== null) return { data: null, error: currencies.error };
  const results = await Promise.all(
    currencies.data.map(async (currency: CurrencyCode) => {
      const { data, error } = await supabase
        .schema("settleup")
        .rpc("get_dashboard_summary_v2", { p_currency_code: currency });
      if (error) return { data: null, error: error.message } as const;
      const parsed = parseDashboardSummaryRpcResult(data);
      if (parsed.error !== null) return parsed;
      return { data: { ...parsed.data, currency_code: currency }, error: null } as const;
    }),
  );
  const failed = results.find((result) => result.error !== null);
  if (failed && failed.error !== null) return { data: null, error: failed.error };
  return { data: results.map((result) => result.data as DashboardSummary), error: null };
}
