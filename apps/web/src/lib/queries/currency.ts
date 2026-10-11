import { supabase } from "@/lib/supabase/client";
import type { ApiResponse, CurrencyCode } from "@template/shared";
import { defaultFirst, parseCurrencyCodes } from "@/lib/currency";

/** Currencies used across my groups (most used first); PHP when there are none. */
export async function getMyCurrencies(): Promise<ApiResponse<CurrencyCode[]>> {
  const { data, error } = await supabase.schema("settleup").rpc("get_my_currencies");
  if (error) return { data: null, error: "Failed to load currencies." };
  return { data: parseCurrencyCodes(data, ["PHP"]), error: null };
}

/** Currencies in one group: its default first. */
export async function getGroupCurrencies(
  groupId: string,
  defaultCurrency: CurrencyCode,
): Promise<ApiResponse<CurrencyCode[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("get_group_currencies", { p_group_id: groupId });
  if (error) return { data: null, error: "Failed to load currencies." };
  return { data: defaultFirst(parseCurrencyCodes(data, [defaultCurrency]), defaultCurrency), error: null };
}
