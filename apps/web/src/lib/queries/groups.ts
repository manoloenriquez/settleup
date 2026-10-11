import { supabase } from "@/lib/supabase/client";
import { groupRowsInDefaultCurrency, type ApiResponse, type CurrencyCode, type GroupWithStats } from "@template/shared";
import { parseGroupsWithStatsRpcResult, type Group } from "@template/supabase";
import { getMyCurrencies } from "@/lib/queries/currency";

// ---------------------------------------------------------------------------
// Client-side read fetchers for the offline-first core views. These run in
// the browser against the same RLS-guarded tables/RPCs the mobile app uses —
// parallel single-round-trip reads with no server-action hop.
// ---------------------------------------------------------------------------

/** The slice of the group row the detail view needs. */
export type GroupRow = Pick<
  Group,
  "id" | "name" | "share_token" | "owner_user_id" | "budget_cents" | "default_currency_code" | "budget_currency_code"
>;

/** Missing or inaccessible (RLS) group resolves to null, not an error. */
export async function getGroupRow(groupId: string): Promise<ApiResponse<GroupRow | null>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("groups")
    .select("id, name, share_token, owner_user_id, budget_cents, default_currency_code, budget_currency_code")
    .eq("id", groupId)
    .maybeSingle();

  if (error) return { data: null, error: "Failed to load group." };
  return { data: data ?? null, error: null };
}

/**
 * Active groups with stats in each group's own default currency. The v2 RPC
 * answers per currency for every group, so it is called once per currency in
 * use and each group keeps the row for its own currency (never summed).
 */
export async function listGroupsWithStats(): Promise<ApiResponse<GroupWithStats[]>> {
  const currencies = await getMyCurrencies();
  if (currencies.error !== null) return { data: null, error: currencies.error };
  const results = await Promise.all(
    currencies.data.map(async (currency: CurrencyCode) => {
      const { data, error } = await supabase
        .schema("settleup")
        .rpc("get_groups_with_stats_v2", { p_currency_code: currency });
      if (error) return { currency, result: { data: null, error: "Failed to load groups." } as const };
      return { currency, result: parseGroupsWithStatsRpcResult(data) };
    }),
  );
  const rows: { currency: CurrencyCode; rows: GroupWithStats[] }[] = [];
  for (const { currency, result } of results) {
    if (result.error !== null) return { data: null, error: result.error };
    rows.push({ currency, rows: result.data ?? [] });
  }
  return { data: groupRowsInDefaultCurrency(rows), error: null };
}

export async function listArchivedGroups(): Promise<ApiResponse<Group[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("groups")
    .select("*")
    .eq("is_archived", true)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: "Failed to load archived groups." };
  return { data: data ?? [], error: null };
}
