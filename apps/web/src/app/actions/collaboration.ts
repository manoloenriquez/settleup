"use server";

import { redirect } from "next/navigation";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { joinGroupSchema, claimMemberSchema } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import type { Group, GroupMember } from "@template/supabase";
import { z } from "zod";

const groupIdSchema = z.string().uuid("Invalid group ID.");
const memberIdSchema = z.string().uuid("Invalid member ID.");

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = result as any;
    if (res?.error) return { data: null, error: res.error };

    const group = res?.group as Group;
    const member = res?.member as GroupMember;
    if (!group || !member) return { data: null, error: "Failed to join group." };

    redirect(`/groups/${group.id}`);
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    if (isNextInternalError(e)) throw e;
    return { data: null, error: "Something went wrong." };
  }
}

export async function claimMember(
  memberId: string,
): Promise<ApiResponse<{ member: GroupMember }>> {
  try {
    const parsed = claimMemberSchema.safeParse({ member_id: memberId });
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("claim_member", {
      p_member_id: parsed.data.member_id,
    });

    if (error) return { data: null, error: error.message };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = result as any;
    if (res?.error) return { data: null, error: res.error };

    return { data: { member: res?.member as GroupMember }, error: null };
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = (result as any)?.share_token as string;
    return { data: { share_token: token }, error: null };
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = (result as any)?.invite_code as string;
    return { data: { invite_code: code }, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}
