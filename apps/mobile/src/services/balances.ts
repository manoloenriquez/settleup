import { supabase } from "@/lib/supabase";
import type { ApiResponse, MemberBalance } from "@template/shared";

export async function getMembersWithBalances(groupId: string): Promise<ApiResponse<MemberBalance[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("get_member_balances", { p_group_id: groupId });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as MemberBalance[], error: null };
}
