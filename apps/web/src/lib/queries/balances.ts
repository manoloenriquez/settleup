import { supabase } from "@/lib/supabase/client";
import type { ApiResponse, CreditorPaymentProfile, MemberBalance } from "@template/shared";

type RpcMemberRow = {
  member_id: string;
  display_name: string;
  slug: string;
  share_token: string;
  user_id: string | null;
  net_cents: number;
};

/** Members + balances via the get_member_balances RPC (4-source formula). */
export async function getMembersWithBalances(groupId: string): Promise<ApiResponse<MemberBalance[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("get_member_balances", { p_group_id: groupId });

  if (error) return { data: null, error: "Failed to load balances." };

  const rows = (data ?? []) as unknown as RpcMemberRow[];
  const balances: MemberBalance[] = rows.map((r) => ({
    member_id: r.member_id,
    display_name: r.display_name,
    slug: r.slug,
    share_token: r.share_token,
    user_id: r.user_id,
    net_cents: r.net_cents,
    owed_cents: Math.max(0, -r.net_cents),
    is_paid: r.net_cents === 0,
  }));

  return { data: balances, error: null };
}

export async function getCreditorProfiles(groupId: string): Promise<ApiResponse<CreditorPaymentProfile[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("get_creditor_profiles", { p_group_id: groupId });

  if (error) return { data: null, error: "Failed to load payment details." };
  return { data: (data ?? []) as CreditorPaymentProfile[], error: null };
}
