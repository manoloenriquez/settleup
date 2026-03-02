"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { AuthError } from "@/lib/supabase/guards";
import { cachedAuth } from "@/lib/supabase/queries";
import type { ApiResponse, MemberBalance } from "@template/shared";
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
 * Fetches members + balances via the get_member_balances RPC (4-source formula).
 */
export async function getMembersWithBalances(
  groupId: string,
): Promise<ApiResponse<MemberBalance[]>> {
  try {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid group ID." };

    await cachedAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data, error } = await db.rpc("get_member_balances", {
      p_group_id: parsed.data,
    });

    if (error) return { data: null, error: error.message };

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
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
