import { z } from "zod";
import { currencyCodeSchema, type ApiResponse, type CurrencyCode } from "@template/shared";
import { supabase } from "@/lib/supabase";

const codesSchema = z.array(currencyCodeSchema);

function parseCodes(data: unknown, fallback: CurrencyCode[]): CurrencyCode[] {
  const parsed = codesSchema.safeParse(data);
  return parsed.success && parsed.data.length > 0 ? parsed.data : fallback;
}

/** Currencies used across my groups (most used first); PHP when there are none. */
export async function getMyCurrencies(): Promise<ApiResponse<CurrencyCode[]>> {
  const { data, error } = await supabase.schema("settleup").rpc("get_my_currencies");
  if (error) return { data: null, error: error.message };
  return { data: parseCodes(data, ["PHP"]), error: null };
}

/** Currencies in one group: its default first. */
export async function getGroupCurrencies(
  groupId: string,
  defaultCurrency: CurrencyCode,
): Promise<ApiResponse<CurrencyCode[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("get_group_currencies", { p_group_id: groupId });
  if (error) return { data: null, error: error.message };
  const codes = parseCodes(data, [defaultCurrency]);
  return { data: [defaultCurrency, ...codes.filter((code) => code !== defaultCurrency)], error: null };
}

/** Currencies behind a public share token (default first); [] when the link is unknown. */
export async function getShareCurrencies(shareToken: string): Promise<ApiResponse<CurrencyCode[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("get_share_currencies", { p_share_token: shareToken });
  if (error) return { data: null, error: error.message };
  return { data: parseCodes(data, []), error: null };
}
