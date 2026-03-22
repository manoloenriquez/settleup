import { supabase } from "@/lib/supabase";
import { generateShareToken } from "@/lib/tokens";
import { addMemberSchema, addMembersBatchSchema, generateSlug } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import type { GroupMember } from "@template/supabase";

export async function addMember(groupId: string, displayName: string): Promise<ApiResponse<GroupMember>> {
  const parsed = addMemberSchema.safeParse({ group_id: groupId, display_name: displayName });
  if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { data: existing } = await supabase
    .schema("settleup")
    .from("group_members")
    .select("slug")
    .eq("group_id", groupId);

  const existingSlugs = (existing ?? []).map((m) => m.slug);
  const slug = generateSlug(parsed.data.display_name, existingSlugs);
  const share_token = await generateShareToken();

  const { data, error } = await supabase
    .schema("settleup")
    .from("group_members")
    .insert({ group_id: groupId, display_name: parsed.data.display_name, slug, share_token })
    .select()
    .single();

  if (error || !data) return { data: null, error: error?.message ?? "Failed to add member" };
  return { data, error: null };
}

export async function addMembersBatch(groupId: string, displayNames: string[]): Promise<ApiResponse<GroupMember[]>> {
  const parsed = addMembersBatchSchema.safeParse({ group_id: groupId, display_names: displayNames });
  if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { data: existing } = await supabase
    .schema("settleup")
    .from("group_members")
    .select("slug")
    .eq("group_id", groupId);

  const existingSlugs = (existing ?? []).map((m) => m.slug);
  const rows = await Promise.all(
    parsed.data.display_names.map(async (name) => {
      const slug = generateSlug(name, existingSlugs);
      existingSlugs.push(slug);
      const share_token = await generateShareToken();
      return { group_id: groupId, display_name: name, slug, share_token };
    })
  );

  const { data, error } = await supabase
    .schema("settleup")
    .from("group_members")
    .insert(rows)
    .select();

  if (error || !data) return { data: null, error: error?.message ?? "Failed to add members" };
  return { data, error: null };
}

export async function listMembers(groupId: string): Promise<ApiResponse<GroupMember[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("group_members")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

export async function deleteMember(memberId: string): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .schema("settleup")
    .from("group_members")
    .delete()
    .eq("id", memberId);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}
