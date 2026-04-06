import { supabase } from "@/lib/supabase";
import type { ApiResponse, CreditorPaymentProfile, MemberBalance } from "@template/shared";

type RpcMemberRow = {
  member_id: string;
  display_name: string;
  slug: string;
  share_token: string;
  user_id: string | null;
  net_cents: number;
};

export async function getMembersWithBalances(groupId: string): Promise<ApiResponse<MemberBalance[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("get_member_balances", { p_group_id: groupId });

  if (error) return { data: null, error: error.message };
  const rows = (data ?? []) as unknown as RpcMemberRow[];
  const balances: MemberBalance[] = rows.map((r) => ({
    ...r,
    owed_cents: Math.max(0, -r.net_cents),
    is_paid: r.net_cents >= 0,
  }));
  return { data: balances, error: null };
}

export async function getCreditorProfiles(groupId: string): Promise<ApiResponse<CreditorPaymentProfile[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("get_creditor_profiles", { p_group_id: groupId });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as CreditorPaymentProfile[], error: null };
}
