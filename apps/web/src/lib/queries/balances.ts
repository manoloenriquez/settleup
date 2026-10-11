import { supabase } from "@/lib/supabase/client";
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

  if (error) return { data: null, error: "Failed to load balances." };

  const rows = (data ?? []) as unknown as RpcMemberRow[];
  const balances: MemberBalance[] = rows.map((r) => ({
    currency_code: currency,
    member_id: r.member_id,
    display_name: r.display_name,
    slug: r.slug,
    share_token: r.share_token,
    user_id: r.user_id,
    ...(r.role ? { role: r.role } : {}),
    ...(r.departed_at !== undefined ? { departed_at: r.departed_at } : {}),
    net_cents: r.net_cents,
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

  if (error) return { data: null, error: "Failed to load payment details." };
  return { data: (data ?? []) as CreditorPaymentProfile[], error: null };
}
