"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { AuthError } from "@/lib/supabase/guards";
import { cachedAuth } from "@/lib/supabase/queries";
import { currencyCodeSchema } from "@template/shared";
import type { ApiResponse, CreditorPaymentProfile, CurrencyCode, MemberBalance } from "@template/shared";
import { z } from "zod";

const groupIdSchema = z.string().uuid("Invalid group ID.");

type RpcMemberRow = {
  member_id: string;
  display_name: string;
  slug: string;
  share_token: string;
  user_id: string | null;
  net_cents: number;
};

/**
 * Members + balances in one currency via get_member_balances_v2 (never
 * converted or mixed with other currencies).
 */
export async function getMembersWithBalances(
  groupId: string,
  currency: CurrencyCode,
): Promise<ApiResponse<MemberBalance[]>> {
  try {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid group ID." };
    const parsedCurrency = currencyCodeSchema.safeParse(currency);
    if (!parsedCurrency.success) return { data: null, error: "Unsupported currency." };

    await cachedAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data, error } = await db.rpc("get_member_balances_v2", {
      p_group_id: parsed.data,
      p_currency_code: parsedCurrency.data,
    });

    if (error) return { data: null, error: "Failed to load balances." };

    const rows = (data ?? []) as unknown as RpcMemberRow[];
    const balances: MemberBalance[] = rows.map((r) => ({
      currency_code: parsedCurrency.data,
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
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

/**
 * Fetches unmasked payment profiles for creditors (members with positive
 * net_cents in the given currency).
 */
export async function getCreditorProfiles(
  groupId: string,
  currency: CurrencyCode,
): Promise<ApiResponse<CreditorPaymentProfile[]>> {
  try {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid group ID." };
    const parsedCurrency = currencyCodeSchema.safeParse(currency);
    if (!parsedCurrency.success) return { data: null, error: "Unsupported currency." };

    await cachedAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data, error } = await db.rpc("get_creditor_profiles_v2", {
      p_group_id: parsed.data,
      p_currency_code: parsedCurrency.data,
    });

    if (error) return { data: null, error: "Failed to load creditor profiles." };

    return { data: (data ?? []) as CreditorPaymentProfile[], error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}
