"use server";

import { redirect } from "next/navigation";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { createGroupSchema } from "@template/shared";
import type { ApiResponse, GroupWithStats } from "@template/shared";
import type { Group } from "@template/supabase";
import { z } from "zod";

const groupIdSchema = z.string().uuid("Invalid group ID.");

// Re-throw Next.js internal errors (redirect, notFound) so they propagate correctly.
function isNextInternalError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "digest" in e;
}

export async function createGroup(_: unknown, formData: FormData): Promise<ApiResponse<Group>> {
  try {
    await assertAuth();

    const parsed = createGroupSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("create_group_with_owner" as never, {
      p_name: parsed.data.name,
    } as never);

    if (error) return { data: null, error: "Failed to create group." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const group = (result as any)?.group as Group;
    if (!group) return { data: null, error: "Failed to create group." };

    redirect(`/groups/${group.id}`);
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    if (isNextInternalError(e)) throw e;
    return { data: null, error: "Something went wrong." };
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

    if (error) return { data: null, error: "Failed to load groups." };
    return { data: data ?? [], error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
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

    if (error) return { data: null, error: "Failed to archive group." };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function listGroupsWithStats(): Promise<ApiResponse<GroupWithStats[]>> {
  try {
    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data, error } = await db.rpc("get_groups_with_stats");

    if (error) return { data: null, error: "Failed to load groups." };

    const rows = (data ?? []) as unknown as GroupWithStats[];
    return { data: rows, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
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

    if (error) return { data: null, error: "Failed to delete group." };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}
