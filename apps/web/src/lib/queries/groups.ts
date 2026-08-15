import { supabase } from "@/lib/supabase/client";
import type { ApiResponse, GroupWithStats } from "@template/shared";
import { parseGroupsWithStatsRpcResult, type Group } from "@template/supabase";

// ---------------------------------------------------------------------------
// Client-side read fetchers for the offline-first core views. These run in
// the browser against the same RLS-guarded tables/RPCs the mobile app uses —
// parallel single-round-trip reads with no server-action hop.
// ---------------------------------------------------------------------------

/** The slice of the group row the detail view needs. */
export type GroupRow = Pick<Group, "id" | "name" | "share_token" | "owner_user_id" | "budget_cents">;

/** Missing or inaccessible (RLS) group resolves to null, not an error. */
export async function getGroupRow(groupId: string): Promise<ApiResponse<GroupRow | null>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("groups")
    .select("id, name, share_token, owner_user_id, budget_cents")
    .eq("id", groupId)
    .maybeSingle();

  if (error) return { data: null, error: "Failed to load group." };
  return { data: data ?? null, error: null };
}

export async function listGroupsWithStats(): Promise<ApiResponse<GroupWithStats[]>> {
  const { data, error } = await supabase.schema("settleup").rpc("get_groups_with_stats");
  if (error) return { data: null, error: "Failed to load groups." };
  return parseGroupsWithStatsRpcResult(data);
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
