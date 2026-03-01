"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { AuthError } from "@/lib/supabase/guards";
import { cachedAuth } from "@/lib/supabase/queries";
import type { ApiResponse } from "@template/shared";

export type ActivityItem = {
  id: string;
  type: "expense" | "payment";
  created_at: string;
  // Expense fields
  item_name?: string;
  amount_cents: number;
  payer_names?: string[];
  participant_count?: number;
  // Payment fields
  from_name?: string;
  to_name?: string;
};

export async function getGroupActivity(
  groupId: string,
): Promise<ApiResponse<ActivityItem[]>> {
  try {
    await cachedAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    // Fetch members, expenses, and payments all in parallel
    const [membersResult, expensesResult, paymentsResult] = await Promise.all([
      db
        .from("group_members")
        .select("id, display_name")
        .eq("group_id", groupId),
      db
        .from("expenses")
        .select("id, item_name, amount_cents, created_at, payers:expense_payers(member_id), participants:expense_participants(member_id)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("payments")
        .select("id, amount_cents, from_member_id, to_member_id, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (membersResult.error) return { data: null, error: membersResult.error.message };
    if (expensesResult.error) return { data: null, error: expensesResult.error.message };
    if (paymentsResult.error) return { data: null, error: paymentsResult.error.message };

    const memberMap = new Map((membersResult.data ?? []).map((m) => [m.id, m.display_name]));

    const activities: ActivityItem[] = [];

    for (const exp of expensesResult.data ?? []) {
      const payerNames = (exp.payers as Array<{ member_id: string }>)
        .map((p) => memberMap.get(p.member_id) ?? "Unknown")
        ;
      activities.push({
        id: exp.id,
        type: "expense",
        created_at: exp.created_at,
        item_name: exp.item_name,
        amount_cents: exp.amount_cents,
        payer_names: payerNames,
        participant_count: (exp.participants as Array<{ member_id: string }>).length,
      });
    }

    for (const pay of paymentsResult.data ?? []) {
      activities.push({
        id: pay.id,
        type: "payment",
        created_at: pay.created_at,
        amount_cents: pay.amount_cents,
        from_name: pay.from_member_id ? memberMap.get(pay.from_member_id) ?? "Unknown" : undefined,
        to_name: pay.to_member_id ? memberMap.get(pay.to_member_id) ?? "Unknown" : undefined,
      });
    }

    // Sort by created_at descending
    activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { data: activities.slice(0, 30), error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
