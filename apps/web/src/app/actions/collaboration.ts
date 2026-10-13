"use server";

import { redirect } from "next/navigation";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { joinGroupSchema, claimMemberSchema, invitePreviewSchema } from "@template/shared";
import type { ApiResponse, InvitePreview } from "@template/shared";
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

/** What joining with this code would do — checked before joining, no member list. */
export async function previewInvite(inviteCode: string): Promise<ApiResponse<InvitePreview>> {
  try {
    await assertAuth();
    const parsed = joinGroupSchema.safeParse({ invite_code: inviteCode });
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    const supabase = await createSettleUpDb();
    const { data, error } = await supabase
      .schema("settleup")
      .rpc("preview_group_invite", { p_invite_code: parsed.data.invite_code });
    // Older databases don't have the check yet; the form then joins without it.
    if (error) {
      return {
        data: null,
        error: error.code === "PGRST202" ? "preview_unavailable" : error.message,
      };
    }
    const preview = invitePreviewSchema.safeParse(data);
    if (!preview.success) return { data: null, error: "The invite couldn't be checked. Try again." };
    return { data: preview.data, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
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

const groupLinkResultSchema = z.object({
  share_enabled: z.boolean(),
  share_token: z.string().nullable().optional(),
});

export type GroupLinkState = { shareEnabled: boolean; shareToken: string | null };

/** Turning the group link off kills it; turning it on issues a brand-new one. Admins only. */
export async function setGroupLinkEnabled(
  groupId: string,
  enabled: boolean,
): Promise<ApiResponse<GroupLinkState>> {
  try {
    const parsed = z.object({ groupId: groupIdSchema, enabled: z.boolean() }).safeParse({ groupId, enabled });
    if (!parsed.success) return { data: null, error: "Invalid group ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const { data, error } = await supabase
      .schema("settleup")
      .rpc("set_group_share_enabled", { p_group_id: parsed.data.groupId, p_enabled: parsed.data.enabled });
    if (error) {
      return {
        data: null,
        error: error.code === "42501" ? "Only group admins can change the shared link." : "Couldn't change the link. Try again.",
      };
    }
    const result = groupLinkResultSchema.safeParse(data);
    if (!result.success) return { data: null, error: "The link setting could not be read." };
    return { data: { shareEnabled: result.data.share_enabled, shareToken: result.data.share_token ?? null }, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

/** A new group link; the previous one stops working at once. Admins only. */
export async function regenerateGroupLink(groupId: string): Promise<ApiResponse<GroupLinkState>> {
  try {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: "Invalid group ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const { data, error } = await supabase
      .schema("settleup")
      .rpc("rotate_group_share_token", { p_group_id: parsed.data });
    if (error) {
      return {
        data: null,
        error: error.code === "42501" ? "Only group admins can change the shared link." : "Couldn't make a new link. Try again.",
      };
    }
    const result = groupLinkResultSchema.safeParse(data);
    if (!result.success) return { data: null, error: "The new link could not be read." };
    return { data: { shareEnabled: result.data.share_enabled, shareToken: result.data.share_token ?? null }, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

/** Hide (or show again) my own payment details on this group's shared pages. */
export async function setHideMyPaymentDetails(
  groupId: string,
  hidden: boolean,
): Promise<ApiResponse<{ hidden: boolean }>> {
  try {
    const parsed = z.object({ groupId: groupIdSchema, hidden: z.boolean() }).safeParse({ groupId, hidden });
    if (!parsed.success) return { data: null, error: "Invalid group ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const { error } = await supabase
      .schema("settleup")
      .rpc("set_hide_payment_details", { p_group_id: parsed.data.groupId, p_hidden: parsed.data.hidden });

    if (error) return { data: null, error: "Couldn't update this setting. Try again." };
    return { data: { hidden: parsed.data.hidden }, error: null };
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
