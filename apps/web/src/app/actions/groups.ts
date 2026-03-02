"use server";

import { redirect } from "next/navigation";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { createClient } from "@/lib/supabase/server";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { createGroupSchema, generateSlug } from "@template/shared";
import { generateShareToken } from "@/lib/tokens";
import type { ApiResponse, GroupWithStats } from "@template/shared";
import type { Group } from "@template/supabase";
import { z } from "zod";

const groupIdSchema = z.string().uuid("Invalid group ID.");

export async function createGroup(_: unknown, formData: FormData): Promise<ApiResponse<Group>> {
  try {
    const user = await assertAuth();

    const parsed = createGroupSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { data, error } = await db
      .from("groups")
      .insert({ name: parsed.data.name, owner_user_id: user.id })
      .select()
      .single();

    if (error || !data) return { data: null, error: error?.message ?? "Failed to create group." };

    // Auto-link owner as first group member
    const publicClient = await createClient();
    const { data: profile } = await publicClient
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const ownerName = profile?.full_name || user.email?.split("@")[0] || "Me";
    const slug = generateSlug(ownerName, []);
    const share_token = generateShareToken();

    const { error: memberInsertError } = await db.from("group_members").insert({
      group_id: data.id,
      display_name: ownerName,
      slug,
      share_token,
      user_id: user.id,
    });

    if (memberInsertError) {
      // Best effort rollback to avoid leaving an ownerless group.
      await db.from("groups").delete().eq("id", data.id);
      return { data: null, error: "Failed to initialize group owner." };
    }

    redirect(`/groups/${data.id}`);
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function listGroups(): Promise<ApiResponse<Group[]>> {
  try {
    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { data, error } = await db
      .from("groups")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: false });

    if (error) return { data: null, error: error.message };
    return { data: data ?? [], error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function archiveGroup(groupId: string): Promise<ApiResponse<void>> {
  try {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid group ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { error } = await db
      .from("groups")
      .update({ is_archived: true })
      .eq("id", parsed.data);

    if (error) return { data: null, error: error.message };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function listGroupsWithStats(): Promise<ApiResponse<GroupWithStats[]>> {
  try {
    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data, error } = await db.rpc("get_groups_with_stats");

    if (error) return { data: null, error: error.message };

    const rows = (data ?? []) as unknown as GroupWithStats[];
    return { data: rows, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function deleteGroup(groupId: string): Promise<ApiResponse<void>> {
  try {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid group ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { error } = await db.from("groups").delete().eq("id", parsed.data);

    if (error) return { data: null, error: error.message };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
