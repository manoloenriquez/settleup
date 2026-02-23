"use server";

import { redirect } from "next/navigation";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { createGroupSchema } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import type { Group } from "@template/supabase";

export async function createGroup(_: unknown, formData: FormData): Promise<ApiResponse<Group>> {
  try {
    const user = await assertAuth();

    const parsed = createGroupSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const db = await createSettleUpDb();
    const { data, error } = await db
      .from("groups")
      .insert({ name: parsed.data.name, owner_user_id: user.id })
      .select()
      .single();

    if (error || !data) return { data: null, error: error?.message ?? "Failed to create group." };

    redirect(`/groups/${data.id}`);
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function listGroups(): Promise<ApiResponse<Group[]>> {
  try {
    await assertAuth();
    const db = await createSettleUpDb();
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
    await assertAuth();
    const db = await createSettleUpDb();
    const { error } = await db
      .from("groups")
      .update({ is_archived: true })
      .eq("id", groupId);

    if (error) return { data: null, error: error.message };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
