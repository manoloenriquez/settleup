"use server";

import { redirect } from "next/navigation";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { createGroupSchema, renameGroupSchema } from "@template/shared";
import type { ApiResponse, GroupWithStats } from "@template/shared";
import {
  parseCreateGroupRpcResult,
  parseGroupsWithStatsRpcResult,
  parseLeaveGroupRpcResult,
  parseTransferOwnershipRpcResult,
  type Group,
} from "@template/supabase";
import { z } from "zod";

const groupIdSchema = z.string().uuid("Invalid group ID.");

// Re-throw Next.js internal errors (redirect, notFound) so they propagate correctly.
function isNextInternalError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "digest" in e;
}

export async function createGroup(_: unknown, formData: FormData): Promise<ApiResponse<Group>> {
  try {
    await assertAuth();

    const parsed = createGroupSchema.safeParse({
      name: formData.get("name"),
      id: formData.get("id") ?? undefined,
    });
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("create_group_with_owner", {
      p_name: parsed.data.name,
      ...(parsed.data.id ? { p_id: parsed.data.id } : {}),
    });

    if (error) return { data: null, error: "Failed to create group." };

    const groupResult = parseCreateGroupRpcResult(result);
    if (groupResult.error) return { data: null, error: groupResult.error };
    if (groupResult.data === null) return { data: null, error: "Failed to create group." };

    redirect(`/groups/${groupResult.data.id}`);
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

export async function transferOwnership(
  groupId: string,
  newOwnerMemberId: string,
): Promise<ApiResponse<void>> {
  try {
    const parsedGroup = groupIdSchema.safeParse(groupId);
    if (!parsedGroup.success) return { data: null, error: "Invalid group ID." };

    const parsedMember = groupIdSchema.safeParse(newOwnerMemberId);
    if (!parsedMember.success) return { data: null, error: "Invalid member ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("transfer_group_ownership", {
      p_group_id: parsedGroup.data,
      p_new_owner_member_id: parsedMember.data,
    });

    if (error) return { data: null, error: error.message };

    const transferResult = parseTransferOwnershipRpcResult(result);
    if (transferResult.error) return { data: null, error: transferResult.error };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function leaveGroup(groupId: string): Promise<ApiResponse<void>> {
  try {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: "Invalid group ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("leave_group", {
      p_group_id: parsed.data,
    });

    if (error) return { data: null, error: error.message };

    const leaveResult = parseLeaveGroupRpcResult(result);
    if (leaveResult.error) return { data: null, error: leaveResult.error };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function renameGroup(input: unknown): Promise<ApiResponse<void>> {
  try {
    await assertAuth();

    const parsed = renameGroupSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { error } = await db.rpc("rename_group", {
      p_group_id: parsed.data.group_id,
      p_name: parsed.data.name,
    });

    if (error) return { data: null, error: error.message };
    return { data: undefined, error: null };
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

export async function restoreGroup(groupId: string): Promise<ApiResponse<void>> {
  try {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid group ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { error } = await db
      .from("groups")
      .update({ is_archived: false })
      .eq("id", parsed.data);

    if (error) return { data: null, error: "Failed to restore group." };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function listArchivedGroups(): Promise<ApiResponse<Group[]>> {
  try {
    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { data, error } = await db
      .from("groups")
      .select("*")
      .eq("is_archived", true)
      .order("created_at", { ascending: false });

    if (error) return { data: null, error: "Failed to load archived groups." };
    return { data: data ?? [], error: null };
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

    const parsedResult = parseGroupsWithStatsRpcResult(data);
    if (parsedResult.error) return { data: null, error: parsedResult.error };

    return parsedResult;
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

export async function setGroupBudget(groupId: string, budgetCents: number | null): Promise<ApiResponse<void>> {
  try {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid group ID." };
    if (budgetCents !== null && (!Number.isInteger(budgetCents) || budgetCents <= 0 || budgetCents > 1_000_000_000)) {
      return { data: null, error: "Budget must be a positive amount." };
    }

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { error } = await db.rpc("set_group_budget", {
      p_group_id: parsed.data,
      p_budget_cents: budgetCents,
    });

    if (error) return { data: null, error: "Failed to update budget." };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}
