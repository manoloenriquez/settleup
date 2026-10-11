import { supabase } from "@/lib/supabase";
import { invitePreviewSchema, type ApiResponse, type InvitePreview } from "@template/shared";
import {
  parseClaimMemberRpcResult,
  parseInviteCodeRpcResult,
  parseJoinGroupRpcResult,
  parseLeaveGroupRpcResult,
  parsePromoteMemberRpcResult,
  parseShareTokenRpcResult,
  type Group,
  type GroupMember,
} from "@template/supabase";

export const PREVIEW_UNAVAILABLE = "preview_unavailable";

/** What joining with this code would do, without joining (no member list). */
export async function previewGroupInvite(inviteCode: string): Promise<ApiResponse<InvitePreview>> {
  if (!inviteCode.trim()) return { data: null, error: "Invite code is required" };
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("preview_group_invite", { p_invite_code: inviteCode.trim() });
  if (error) {
    // Older databases don't have the check yet: joining still works, so say
    // "unavailable" and let the caller join without it.
    if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) {
      return { data: null, error: PREVIEW_UNAVAILABLE };
    }
    return { data: null, error: error.message };
  }
  const parsed = invitePreviewSchema.safeParse(data);
  if (!parsed.success) return { data: null, error: "The invite couldn’t be checked. Try again." };
  return { data: parsed.data, error: null };
}

export async function joinGroupByInvite(
  inviteCode: string,
): Promise<ApiResponse<{ group: Group; member: GroupMember }>> {
  if (!inviteCode.trim()) return { data: null, error: "Invite code is required" };

  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("join_group_by_invite", { p_invite_code: inviteCode.trim() });

  if (error) return { data: null, error: error.message };

  return parseJoinGroupRpcResult(result);
}

export async function claimMember(token: string): Promise<ApiResponse<{ member: GroupMember }>> {
  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("claim_member_with_token", { p_token: token });

  if (error) return { data: null, error: error.message };

  return parseClaimMemberRpcResult(result);
}

export async function rotateShareToken(
  memberId: string,
): Promise<ApiResponse<{ share_token: string }>> {
  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("rotate_member_share_token", { p_member_id: memberId });

  if (error) return { data: null, error: error.message };

  return parseShareTokenRpcResult(result);
}

export async function leaveGroup(groupId: string): Promise<ApiResponse<{ success: boolean }>> {
  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("leave_group", { p_group_id: groupId });

  if (error) return { data: null, error: error.message };

  return parseLeaveGroupRpcResult(result);
}

export async function regenerateInviteCode(
  groupId: string,
): Promise<ApiResponse<{ invite_code: string }>> {
  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("regenerate_invite_code", { p_group_id: groupId });

  if (error) return { data: null, error: error.message };

  return parseInviteCodeRpcResult(result);
}

export async function promoteMember(
  memberId: string,
  role: "admin" | "member",
): Promise<ApiResponse<GroupMember>> {
  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("promote_member", { p_member_id: memberId, p_role: role });

  if (error) return { data: null, error: error.message };

  return parsePromoteMemberRpcResult(result);
}
