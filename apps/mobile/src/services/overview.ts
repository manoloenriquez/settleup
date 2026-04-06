import { supabase } from "@/lib/supabase";
import type { ApiResponse, GroupOverviewPayload } from "@template/shared";

export async function getGroupOverview(shareToken: string): Promise<ApiResponse<GroupOverviewPayload>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("get_group_overview", { p_share_token: shareToken });

  if (error) return { data: null, error: error.message };

  const payload = data as GroupOverviewPayload;
  if (payload.error) return { data: null, error: payload.error };

  return { data: payload, error: null };
}
