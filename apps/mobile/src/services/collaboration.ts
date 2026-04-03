import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";
import type { Group, GroupMember } from "@template/supabase";

export async function joinGroupByInvite(
  inviteCode: string,
): Promise<ApiResponse<{ group: Group; member: GroupMember }>> {
  if (!inviteCode.trim()) return { data: null, error: "Invite code is required" };

  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("join_group_by_invite", { p_invite_code: inviteCode.trim() });

  if (error) return { data: null, error: error.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = result as any;
  if (res?.error) return { data: null, error: res.error };

  const group = res?.group as Group;
  const member = res?.member as GroupMember;
  if (!group || !member) return { data: null, error: "Failed to join group" };

  return { data: { group, member }, error: null };
}

export async function claimMember(
  memberId: string,
): Promise<ApiResponse<{ member: GroupMember }>> {
  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("claim_member", { p_member_id: memberId });

  if (error) return { data: null, error: error.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = result as any;
  if (res?.error) return { data: null, error: res.error };

  return { data: { member: res?.member as GroupMember }, error: null };
}

export async function rotateShareToken(
  memberId: string,
): Promise<ApiResponse<{ share_token: string }>> {
  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("rotate_member_share_token", { p_member_id: memberId });

  if (error) return { data: null, error: error.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (result as any)?.share_token as string;
  return { data: { share_token: token }, error: null };
}

export async function regenerateInviteCode(
  groupId: string,
): Promise<ApiResponse<{ invite_code: string }>> {
  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("regenerate_invite_code", { p_group_id: groupId });

  if (error) return { data: null, error: error.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const code = (result as any)?.invite_code as string;
  return { data: { invite_code: code }, error: null };
}
