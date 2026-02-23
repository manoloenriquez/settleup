"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { addMemberSchema, addMembersBatchSchema, generateSlug } from "@template/shared";
import { generateShareToken } from "@/lib/tokens";
import type { ApiResponse } from "@template/shared";
import type { GroupMember } from "@template/supabase";

export async function addMember(input: unknown): Promise<ApiResponse<GroupMember>> {
  try {
    await assertAuth();

    const parsed = addMemberSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    // Verify ownership
    const { data: group, error: groupError } = await db
      .from("groups")
      .select("id")
      .eq("id", parsed.data.group_id)
      .single();

    if (groupError || !group) return { data: null, error: "Group not found." };

    // Fetch existing slugs to ensure uniqueness
    const { data: existingMembers } = await db
      .from("group_members")
      .select("slug")
      .eq("group_id", parsed.data.group_id);

    const existingSlugs = (existingMembers ?? []).map((m) => m.slug);
    const slug = generateSlug(parsed.data.display_name, existingSlugs);
    const share_token = generateShareToken();

    const { data, error } = await db
      .from("group_members")
      .insert({
        group_id: parsed.data.group_id,
        display_name: parsed.data.display_name,
        slug,
        share_token,
      })
      .select()
      .single();

    if (error || !data) return { data: null, error: error?.message ?? "Failed to add member." };
    return { data, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function addMembersBatch(input: unknown): Promise<ApiResponse<GroupMember[]>> {
  try {
    await assertAuth();

    const parsed = addMembersBatchSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { group_id, display_names } = parsed.data;
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    // Verify ownership (RLS handles auth, this confirms group exists for this user)
    const { data: group, error: groupError } = await db
      .from("groups")
      .select("id")
      .eq("id", group_id)
      .single();

    if (groupError || !group) return { data: null, error: "Group not found." };

    // Fetch existing slugs once
    const { data: existingMembers } = await db
      .from("group_members")
      .select("slug")
      .eq("group_id", group_id);

    const existingSlugs = (existingMembers ?? []).map((m) => m.slug);

    // Build rows, accumulating slugs to avoid duplicates within the batch
    const rows = display_names.map((display_name) => {
      const slug = generateSlug(display_name, existingSlugs);
      existingSlugs.push(slug);
      const share_token = generateShareToken();
      return { group_id, display_name, slug, share_token };
    });

    const { data, error } = await db.from("group_members").insert(rows).select();

    if (error || !data) return { data: null, error: error?.message ?? "Failed to add members." };
    return { data, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function listMembers(groupId: string): Promise<ApiResponse<GroupMember[]>> {
  try {
    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { data, error } = await db
      .from("group_members")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data: data ?? [], error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function deleteMember(memberId: string): Promise<ApiResponse<void>> {
  try {
    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { error } = await db.from("group_members").delete().eq("id", memberId);
    if (error) return { data: null, error: error.message };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
