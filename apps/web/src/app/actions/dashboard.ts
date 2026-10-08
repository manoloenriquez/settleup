"use server";

import { AuthError } from "@/lib/supabase/guards";
import { cachedAuth } from "@/lib/supabase/queries";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { logServerError } from "@/lib/log";
import { parseCurrencyCodes } from "@/lib/currency";
import type { ApiResponse, DashboardSummary } from "@template/shared/types";
import { parseDashboardSummaryRpcResult } from "@template/supabase";

function logDashboardTiming(durationMs: number): void {
  if (process.env.NODE_ENV === "development") {
    console.info(`[perf] web dashboard summary ${durationMs}ms`);
  }
}

/** One summary per currency used in my groups; amounts are never combined. */
export async function getDashboardSummaries(): Promise<ApiResponse<DashboardSummary[]>> {
  const startedAt = Date.now();

  try {
    await cachedAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const currencies = await db.rpc("get_my_currencies");
    if (currencies.error) {
      logServerError("get_my_currencies", currencies.error);
      return { data: null, error: "Failed to load dashboard." };
    }

    const summaries: DashboardSummary[] = [];
    for (const currency of parseCurrencyCodes(currencies.data, ["PHP"])) {
      const { data, error } = await db.rpc("get_dashboard_summary_v2", { p_currency_code: currency });
      if (error) {
        logServerError("get_dashboard_summary_v2", error);
        return { data: null, error: "Failed to load dashboard." };
      }
      const parsed = parseDashboardSummaryRpcResult(data);
      if (parsed.error !== null) return { data: null, error: parsed.error };
      summaries.push({ ...parsed.data, currency_code: currency });
    }
    return { data: summaries, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    logServerError("getDashboardSummaries", e);
    return { data: null, error: "Something went wrong." };
  } finally {
    logDashboardTiming(Date.now() - startedAt);
  }
}
