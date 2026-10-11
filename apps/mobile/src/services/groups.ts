import { supabase } from "@/lib/supabase";
import { groupRowsInDefaultCurrency, type ApiResponse, type CurrencyCode, type GroupWithStats } from "@template/shared";
import { getMyCurrencies } from "@/services/currency";
import {
  parseCreateGroupRpcResult,
  parseGroupsWithStatsRpcResult,
  parseTransferOwnershipRpcResult,
  type Group,
} from "@template/supabase";

export async function createGroup(input: {
  id: string;
  name: string;
  currency: CurrencyCode;
  displayName: string;
}): Promise<ApiResponse<Group>> {
  const name = input.name.trim();
  const displayName = input.displayName.trim();
  if (!name) return { data: null, error: "Enter a group name." };
  if (name.length > 100) return { data: null, error: "Keep the group name under 100 characters." };
  if (!displayName) return { data: null, error: "Enter the name the group will see for you." };
  if (displayName.length > 80) return { data: null, error: "Keep your name under 80 characters." };

  const { data: result, error } = await supabase.schema("settleup").rpc("create_group_v2", {
    p_name: name,
    p_id: input.id,
    p_currency_code: input.currency,
    p_display_name: displayName,
  });

  if (error) return { data: null, error: error.message };

  return parseCreateGroupRpcResult(result);
}

export async function listGroups(): Promise<ApiResponse<Group[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("groups")
    .select("*")
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

/**
 * Active groups with stats in each group's own default currency. The v2 RPC
 * answers per currency for every group, so it is called once per currency in
 * use and each group keeps the row for its own currency (never summed).
 */
export async function listGroupsWithStats(): Promise<ApiResponse<GroupWithStats[]>> {
  const currencies = await getMyCurrencies();
  if (currencies.error !== null) return { data: null, error: currencies.error };
  const results: { currency: CurrencyCode; rows: GroupWithStats[] }[] = [];
  for (const currency of currencies.data) {
    const { data, error } = await supabase
      .schema("settleup")
      .rpc("get_groups_with_stats_v2", { p_currency_code: currency });
    if (error) return { data: null, error: error.message };
    const parsed = parseGroupsWithStatsRpcResult(data);
    if (parsed.error !== null) return { data: null, error: parsed.error };
    results.push({ currency, rows: parsed.data });
  }
  return { data: groupRowsInDefaultCurrency(results), error: null };
}

export async function setGroupBudget(
  groupId: string,
  budgetCents: number | null,
  currency: CurrencyCode,
): Promise<ApiResponse<null>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("set_group_budget_v2", { p_group_id: groupId, p_budget_cents: budgetCents, p_currency_code: currency });

  if (error || !data) return { data: null, error: error?.message ?? "Failed to update budget" };
  return { data: null, error: null };
}

export async function renameGroup(groupId: string, name: string): Promise<ApiResponse<null>> {
  const trimmed = name.trim();
  if (!trimmed) return { data: null, error: "Name is required" };
  if (trimmed.length > 100) return { data: null, error: "Name must be at most 100 characters" };

  const { error } = await supabase
    .schema("settleup")
    .rpc("rename_group", { p_group_id: groupId, p_name: trimmed });

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

export async function archiveGroup(groupId: string): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .schema("settleup")
    .from("groups")
    .update({ is_archived: true })
    .eq("id", groupId);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// Keep deleteGroup as an alias for backward compatibility
export const deleteGroup = archiveGroup;

export async function restoreGroup(groupId: string): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .schema("settleup")
    .from("groups")
    .update({ is_archived: false })
    .eq("id", groupId);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

export async function transferOwnership(
  groupId: string,
  newOwnerMemberId: string,
): Promise<ApiResponse<{ success: boolean }>> {
  const { data: result, error } = await supabase
    .schema("settleup")
    .rpc("transfer_group_ownership", {
      p_group_id: groupId,
      p_new_owner_member_id: newOwnerMemberId,
    });

  if (error) return { data: null, error: error.message };
  return parseTransferOwnershipRpcResult(result);
}

export async function listArchivedGroups(): Promise<ApiResponse<Group[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("groups")
    .select("*")
    .eq("is_archived", true)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}
