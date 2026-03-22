import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";

export type ActivityItem = {
  id: string;
  type: "expense" | "payment";
  label: string;
  amount_cents: number;
  created_at: string;
  actor_name?: string;
};

export async function getGroupActivity(groupId: string): Promise<ApiResponse<ActivityItem[]>> {
  const [expensesRes, paymentsRes] = await Promise.all([
    supabase
      .schema("settleup")
      .from("expenses")
      .select("id, item_name, amount_cents, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .schema("settleup")
      .from("payments")
      .select("id, amount_cents, created_at, from_member_id")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const items: ActivityItem[] = [];

  for (const e of expensesRes.data ?? []) {
    items.push({ id: e.id, type: "expense", label: e.item_name, amount_cents: e.amount_cents, created_at: e.created_at });
  }

  for (const p of paymentsRes.data ?? []) {
    items.push({ id: p.id, type: "payment", label: "Payment recorded", amount_cents: p.amount_cents, created_at: p.created_at });
  }

  // Sort by date desc
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return { data: items.slice(0, 30), error: null };
}
