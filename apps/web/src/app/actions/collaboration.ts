"use server";

import { redirect } from "next/navigation";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { joinGroupSchema, claimMemberSchema } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import {
  parseClaimMemberRpcResult,
  parseInviteCodeRpcResult,
  parseJoinGroupRpcResult,
  parsePromoteMemberRpcResult,
  parseShareTokenRpcResult,
  type Group,
  type GroupMember,
} from "@template/supabase";
import { z } from "zod";

const groupIdSchema = z.string().uuid("Invalid group ID.");
const memberIdSchema = z.string().uuid("Invalid member ID.");
const promoteMemberSchema = z.object({
  member_id: z.string().uuid("Invalid member ID."),
  role: z.enum(["admin", "member"]),
});

function isNextInternalError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "digest" in e;
}

export async function joinGroup(
  _: unknown,
  formData: FormData,
): Promise<ApiResponse<{ group: Group; member: GroupMember }>> {
  try {
    await assertAuth();

    const parsed = joinGroupSchema.safeParse({ invite_code: formData.get("invite_code") });
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("join_group_by_invite", {
      p_invite_code: parsed.data.invite_code,
    });

    if (error) return { data: null, error: error.message };

    const joinResult = parseJoinGroupRpcResult(result);
    if (joinResult.error) return { data: null, error: joinResult.error };
    if (joinResult.data === null) return { data: null, error: "Failed to join group." };

    redirect(`/groups/${joinResult.data.group.id}`);
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    if (isNextInternalError(e)) throw e;
    return { data: null, error: "Something went wrong." };
  }
}

export async function claimMember(token: string): Promise<ApiResponse<{ member: GroupMember }>> {
  try {
    const parsed = claimMemberSchema.safeParse({ token });
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("claim_member_with_token", {
      p_token: parsed.data.token,
    });

    if (error) return { data: null, error: error.message };

    return parseClaimMemberRpcResult(result);
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function rotateShareToken(
  memberId: string,
): Promise<ApiResponse<{ share_token: string }>> {
  try {
    const parsed = memberIdSchema.safeParse(memberId);
    if (!parsed.success) return { data: null, error: "Invalid member ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("rotate_member_share_token", {
      p_member_id: parsed.data,
    });

    if (error) return { data: null, error: error.message };

    return parseShareTokenRpcResult(result);
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function regenerateInviteCode(
  groupId: string,
): Promise<ApiResponse<{ invite_code: string }>> {
  try {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: "Invalid group ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("regenerate_invite_code", {
      p_group_id: parsed.data,
    });

    if (error) return { data: null, error: error.message };

    return parseInviteCodeRpcResult(result);
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function promoteMember(
  memberId: string,
  role: "admin" | "member",
): Promise<ApiResponse<GroupMember>> {
  try {
    const parsed = promoteMemberSchema.safeParse({ member_id: memberId, role });
    if (!parsed.success)
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("promote_member", {
      p_member_id: parsed.data.member_id,
      p_role: parsed.data.role,
    });

    if (error) return { data: null, error: error.message };

    return parsePromoteMemberRpcResult(result);
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function createClaimInvitation(
  memberId: string,
): Promise<ApiResponse<{ token: string }>> {
  try {
    await assertAuth();
    const parsed = memberIdSchema.safeParse(memberId);
    if (!parsed.success) return { data: null, error: "Invalid member." };
    const db = await createSettleUpDb();
    const { data, error } = await db
      .schema("settleup")
      .rpc("create_member_claim_invitation", { p_member_id: parsed.data });
    const result = z.object({ token: z.string() }).safeParse(data);
    if (error || !result.success)
      return { data: null, error: error?.message ?? "Could not create invitation." };
    return { data: result.data, error: null };
  } catch {
    return { data: null, error: "Could not create invitation." };
  }
}

export async function revokeClaimInvitation(memberId: string): Promise<ApiResponse<void>> {
  try {
    await assertAuth();
    const parsed = memberIdSchema.safeParse(memberId);
    if (!parsed.success) return { data: null, error: "Invalid member." };
    const db = await createSettleUpDb();
    const { error } = await db
      .schema("settleup")
      .rpc("revoke_member_claim_invitation", { p_member_id: parsed.data });
    return error ? { data: null, error: error.message } : { data: undefined, error: null };
  } catch {
    return { data: null, error: "Could not revoke invitation." };
  }
}
