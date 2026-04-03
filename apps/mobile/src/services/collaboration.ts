import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";
import {
  parseClaimMemberRpcResult,
  parseInviteCodeRpcResult,
  parseJoinGroupRpcResult,
  parseShareTokenRpcResult,
  type Group,
  type GroupMember,
} from "@template/supabase";

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

export async function claimMember(
  memberId: string,
): Promise<ApiResponse<{ member: GroupMember }>> {
  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("claim_member", { p_member_id: memberId });

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

export async function regenerateInviteCode(
  groupId: string,
): Promise<ApiResponse<{ invite_code: string }>> {
  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("regenerate_invite_code", { p_group_id: groupId });

  if (error) return { data: null, error: error.message };

  return parseInviteCodeRpcResult(result);
}
