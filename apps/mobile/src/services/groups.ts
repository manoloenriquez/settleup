import { supabase } from "@/lib/supabase";
import type { ApiResponse, GroupWithStats } from "@template/shared";
import {
  parseCreateGroupRpcResult,
  parseGroupsWithStatsRpcResult,
  parseTransferOwnershipRpcResult,
  type Group,
} from "@template/supabase";

export async function createGroup(name: string): Promise<ApiResponse<Group>> {
  if (!name.trim()) return { data: null, error: "Group name is required" };
  if (name.trim().length > 100) return { data: null, error: "Group name must be at most 100 characters" };

  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("create_group_with_owner", { p_name: name.trim() });

  if (error) return { data: null, error: error.message };

  return parseCreateGroupRpcResult(result);
}

export async function listGroups(): Promise<ApiResponse<Group[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("groups")
    .select("*")
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

export async function listGroupsWithStats(_userId?: string): Promise<ApiResponse<GroupWithStats[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("get_groups_with_stats");

  if (error) {
    // Fallback: plain groups list
    const fallback = await listGroups();
    if (fallback.error) return { data: null, error: fallback.error };
    return {
      data: (fallback.data ?? []).map((g) => ({
        ...g,
        member_count: 0,
        pending_count: 0,
        total_owed_cents: 0,
      })),
      error: null,
    };
  }
  const parsed = parseGroupsWithStatsRpcResult(data);
  if (parsed.error) return { data: null, error: parsed.error };

  return parsed;
}

export async function setGroupBudget(groupId: string, budgetCents: number | null): Promise<ApiResponse<null>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("set_group_budget", { p_group_id: groupId, p_budget_cents: budgetCents });

  if (error || !data) return { data: null, error: error?.message ?? "Failed to update budget" };
  return { data: null, error: null };
}

export async function renameGroup(groupId: string, name: string): Promise<ApiResponse<null>> {
  const trimmed = name.trim();
  if (!trimmed) return { data: null, error: "Name is required" };
  if (trimmed.length > 100) return { data: null, error: "Name must be at most 100 characters" };

  const { error } = await supabase
    .schema("settleup")
    .rpc("rename_group", { p_group_id: groupId, p_name: trimmed });

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

export async function archiveGroup(groupId: string): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .schema("settleup")
    .from("groups")
    .update({ is_archived: true })
    .eq("id", groupId);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// Keep deleteGroup as an alias for backward compatibility
export const deleteGroup = archiveGroup;

export async function restoreGroup(groupId: string): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .schema("settleup")
    .from("groups")
    .update({ is_archived: false })
    .eq("id", groupId);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

export async function transferOwnership(
  groupId: string,
  newOwnerMemberId: string,
): Promise<ApiResponse<{ success: boolean }>> {
  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("transfer_group_ownership", {
      p_group_id: groupId,
      p_new_owner_member_id: newOwnerMemberId,
    });

  if (error) return { data: null, error: error.message };
  return parseTransferOwnershipRpcResult(result);
}

export async function listArchivedGroups(): Promise<ApiResponse<Group[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("groups")
    .select("*")
    .eq("is_archived", true)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}
