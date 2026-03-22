import { supabase } from "@/lib/supabase";
import { generateShareToken } from "@/lib/tokens";
import { createGroupSchema, generateSlug } from "@template/shared";
import type { ApiResponse, GroupWithStats } from "@template/shared";
import type { Group } from "@template/supabase";

export async function createGroup(name: string, userId: string): Promise<ApiResponse<Group>> {
  const parsed = createGroupSchema.safeParse({ name });
  if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // Insert group
  const { data: group, error: groupErr } = await supabase
    .schema("settleup")
    .from("groups")
    .insert({ name: parsed.data.name, owner_user_id: userId })
    .select()
    .single();

  if (groupErr || !group) return { data: null, error: groupErr?.message ?? "Failed to create group" };

  // Get owner display name
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();

  const ownerName = profile?.full_name ?? "Me";
  const slug = generateSlug(ownerName, []);
  const share_token = await generateShareToken();

  // Auto-create owner as first member
  const { error: memberErr } = await supabase
    .schema("settleup")
    .from("group_members")
    .insert({ group_id: group.id, display_name: ownerName, slug, share_token, user_id: userId });

  if (memberErr) return { data: null, error: memberErr.message };

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

export async function listGroupsWithStats(userId: string): Promise<ApiResponse<GroupWithStats[]>> {
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
