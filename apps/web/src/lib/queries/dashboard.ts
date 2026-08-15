import { supabase } from "@/lib/supabase/client";
import type { ApiResponse, DashboardSummary } from "@template/shared";
import { parseDashboardSummaryRpcResult } from "@template/supabase";

export async function getDashboardSummary(): Promise<ApiResponse<DashboardSummary>> {
  const { data, error } = await supabase.schema("settleup").rpc("get_dashboard_summary");
  if (error) return { data: null, error: "Failed to load dashboard." };
  return parseDashboardSummaryRpcResult(data);
}
