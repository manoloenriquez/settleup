"use server";

import { AuthError } from "@/lib/supabase/guards";
import { cachedAuth } from "@/lib/supabase/queries";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { logServerError } from "@/lib/log";
import type { ApiResponse, DashboardSummary } from "@template/shared/types";
import { parseDashboardSummaryRpcResult } from "@template/supabase";

function logDashboardTiming(durationMs: number): void {
  if (process.env.NODE_ENV === "development") {
    console.info(`[perf] web dashboard summary ${durationMs}ms`);
  }
}

export async function getDashboardSummary(): Promise<ApiResponse<DashboardSummary>> {
  const startedAt = Date.now();

  try {
    await cachedAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data, error } = await db.rpc("get_dashboard_summary");
    if (error) {
      logServerError("get_dashboard_summary", error);
      return { data: null, error: "Failed to load dashboard." };
    }

    return parseDashboardSummaryRpcResult(data);
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    logServerError("getDashboardSummary", e);
    return { data: null, error: "Something went wrong." };
  } finally {
    logDashboardTiming(Date.now() - startedAt);
  }
}
