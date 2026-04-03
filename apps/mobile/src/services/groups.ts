import { supabase } from "@/lib/supabase";
import type { ApiResponse, GroupWithStats } from "@template/shared";
import type { Group } from "@template/supabase";

export async function createGroup(name: string): Promise<ApiResponse<Group>> {
  if (!name.trim()) return { data: null, error: "Group name is required" };
  if (name.trim().length > 100) return { data: null, error: "Group name must be at most 100 characters" };

  const { data: result, error } = await supabase
    .schema("settleup")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .rpc("create_group_with_owner" as any, { p_name: name.trim() });

  if (error) return { data: null, error: error.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const group = (result as any)?.group as Group;
  if (!group) return { data: null, error: "Failed to create group" };

  return { data: group, error: null };
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .rpc("get_groups_with_stats" as any);

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
  return { data: (data as unknown as GroupWithStats[]) ?? [], error: null };
}

export async function deleteGroup(groupId: string): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .schema("settleup")
    .from("groups")
    .update({ is_archived: true })
    .eq("id", groupId);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}
