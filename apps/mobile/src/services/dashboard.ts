import { supabase } from "@/lib/supabase";
import type { ApiResponse, DashboardSummary } from "@template/shared";
import { parseDashboardSummaryRpcResult } from "@template/supabase";

function logDashboardTiming(durationMs: number): void {
  if (process.env.NODE_ENV === "development") {
    console.info(`[perf] mobile dashboard summary ${durationMs}ms`);
  }
}

export async function getDashboardSummary(): Promise<ApiResponse<DashboardSummary>> {
  const startedAt = Date.now();

  try {
    const { data, error } = await supabase
      .schema("settleup")
      .rpc("get_dashboard_summary");

    if (error) return { data: null, error: error.message };

    return parseDashboardSummaryRpcResult(data);
  } finally {
    logDashboardTiming(Date.now() - startedAt);
  }
}
