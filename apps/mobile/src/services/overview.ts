import { supabase } from "@/lib/supabase";
import type { ApiResponse, CurrencyCode, GroupOverviewPayload } from "@template/shared";
import { getShareCurrencies } from "@/services/currency";

/** The shared-page payload for each currency the group uses (default first). */
export async function getGroupOverviews(shareToken: string): Promise<ApiResponse<GroupOverviewPayload[]>> {
  const currencies = await getShareCurrencies(shareToken);
  if (currencies.error !== null) return { data: null, error: currencies.error };
  if (currencies.data.length === 0) return { data: null, error: "This shared link is no longer available." };
  const payloads: GroupOverviewPayload[] = [];
  for (const currency of currencies.data as CurrencyCode[]) {
    const { data, error } = await supabase
      .schema("settleup")
      .rpc("get_group_overview_v2", { p_share_token: shareToken, p_currency_code: currency });
    if (error) return { data: null, error: error.message };
    const payload = data as GroupOverviewPayload;
    if (payload.error) return { data: null, error: payload.error };
    payloads.push({ ...payload, currency_code: currency });
  }
  return { data: payloads, error: null };
}
