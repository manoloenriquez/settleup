"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import type { ApiResponse, MemberBalance } from "@template/shared";

/**
 * Fetches members + balances in a single action with parallelised DB queries.
 * Replaces the separate listMembers + getGroupBalances calls on the group detail page.
 */
export async function getMembersWithBalances(
  groupId: string,
): Promise<ApiResponse<MemberBalance[]>> {
  try {
    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: members, error: membersError } = await db
      .from("group_members")
      .select("id, display_name, slug, share_token")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });

    if (membersError) return { data: null, error: membersError.message };
    if (!members || members.length === 0) return { data: [], error: null };

    const memberIds = members.map((m) => m.id);

    // Parallelise shares + payments — they are independent of each other
    const [shareResult, paymentResult] = await Promise.all([
      db
        .from("expense_participants")
        .select("member_id, share_cents")
        .in("member_id", memberIds),
      db
        .from("payments")
        .select("member_id, amount_cents")
        .in("member_id", memberIds),
    ]);

    if (shareResult.error) return { data: null, error: shareResult.error.message };
    if (paymentResult.error) return { data: null, error: paymentResult.error.message };

    const sharesMap = new Map<string, number>();
    for (const row of shareResult.data ?? []) {
      sharesMap.set(row.member_id, (sharesMap.get(row.member_id) ?? 0) + row.share_cents);
    }

    const paidMap = new Map<string, number>();
    for (const row of paymentResult.data ?? []) {
      paidMap.set(row.member_id, (paidMap.get(row.member_id) ?? 0) + row.amount_cents);
    }

    const balances: MemberBalance[] = members.map((m) => {
      const total = sharesMap.get(m.id) ?? 0;
      const paid = paidMap.get(m.id) ?? 0;
      const owed_cents = Math.max(0, total - paid);
      return {
        member_id: m.id,
        display_name: m.display_name,
        slug: m.slug,
        share_token: m.share_token,
        owed_cents,
        is_paid: owed_cents === 0,
      };
    });

    return { data: balances, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
