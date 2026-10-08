import { supabase } from "@/lib/supabase";
import type { ApiResponse, CreditorPaymentProfile, CurrencyCode, MemberBalance } from "@template/shared";

type RpcMemberRow = {
  member_id: string;
  display_name: string;
  slug: string;
  share_token: string;
  user_id: string | null;
  role?: MemberBalance["role"];
  departed_at?: string | null;
  net_cents: number;
};

/** Balances of every member in one currency (never converted or mixed). */
export async function getMembersWithBalances(
  groupId: string,
  currency: CurrencyCode,
): Promise<ApiResponse<MemberBalance[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("get_member_balances_v2", { p_group_id: groupId, p_currency_code: currency });

  if (error) return { data: null, error: error.message };
  const rows = (data ?? []) as unknown as RpcMemberRow[];
  const balances: MemberBalance[] = rows.map((r) => ({
    ...r,
    currency_code: currency,
    owed_cents: Math.max(0, -r.net_cents),
    is_paid: r.net_cents === 0,
  }));
  return { data: balances, error: null };
}

export async function getCreditorProfiles(
  groupId: string,
  currency: CurrencyCode,
): Promise<ApiResponse<CreditorPaymentProfile[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("get_creditor_profiles_v2", { p_group_id: groupId, p_currency_code: currency });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as CreditorPaymentProfile[], error: null };
}
