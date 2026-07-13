import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";
import { mergeAndSortActivity, type ActivityItem } from "@/lib/activity-utils";

export type { ActivityItem } from "@/lib/activity-utils";

export async function getGroupActivity(groupId: string): Promise<ApiResponse<ActivityItem[]>> {
  const [expensesRes, paymentsRes] = await Promise.all([
    supabase
      .schema("settleup")
      .from("expenses")
      .select("id, item_name, amount_cents, created_at, category:expense_categories(id, name, slug, icon, color, is_default)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .schema("settleup")
      .from("payments")
      .select("id, amount_cents, created_at, from_member_id")
      .eq("group_id", groupId)
      .eq("status", "PAID")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return { data: mergeAndSortActivity(expensesRes.data ?? [], paymentsRes.data ?? []), error: null };
}

export type RecentActivityItem = {
  id: string;
  type: "expense" | "payment";
  group_id: string;
  group_name: string;
  created_at: string;
  title: string;
  subtitle: string;
  /** How this event moved the viewer's balance (absolute value). */
  amount_cents: number;
  direction: "in" | "out" | "neutral";
  category: {
    id: string;
    name: string;
    slug: string;
    icon: string;
    color: string;
    is_default: boolean;
  } | null;
};

export async function getRecentActivity(
  limit = 10,
): Promise<ApiResponse<RecentActivityItem[]>> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return { data: null, error: "Not signed in." };

  const db = supabase.schema("settleup");

  // RLS scopes every query to groups the viewer can access — no group filter.
  const [myMembersRes, expensesRes, paymentsRes] = await Promise.all([
    db.from("group_members").select("id").eq("user_id", userId),
    db
      .from("expenses")
      .select(
        "id, group_id, item_name, amount_cents, created_at, group:groups(id, name), category:expense_categories(id, name, slug, icon, color, is_default), payers:expense_payers(member_id, paid_cents, member:group_members(display_name)), participants:expense_participants(member_id, share_cents)",
      )
      .order("created_at", { ascending: false })
      .limit(limit),
    db
      .from("payments")
      .select("id, group_id, amount_cents, created_at, from_member_id, to_member_id, group:groups(id, name)")
      .eq("status", "PAID")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (myMembersRes.error || expensesRes.error || paymentsRes.error) {
    return { data: null, error: "Failed to load activity." };
  }

  // payments has no FK to group_members, so embeds can't resolve names —
  // batch-fetch the referenced member rows instead.
  const paymentMemberIds = [
    ...new Set(
      (paymentsRes.data ?? [])
        .flatMap((p) => [p.from_member_id, p.to_member_id])
        .filter((id): id is string => id !== null),
    ),
  ];
  const paymentMembersRes = paymentMemberIds.length
    ? await db.from("group_members").select("id, display_name").in("id", paymentMemberIds)
    : { data: [], error: null };
  if (paymentMembersRes.error) {
    return { data: null, error: "Failed to load activity." };
  }
  const memberNames = new Map(
    (paymentMembersRes.data ?? []).map((m) => [m.id, m.display_name]),
  );

  const myMemberIds = new Set((myMembersRes.data ?? []).map((m) => m.id));
  const items: RecentActivityItem[] = [];

  for (const exp of expensesRes.data ?? []) {
    if (!exp.group) continue;
    const payers = Array.isArray(exp.payers) ? exp.payers : [];
    const participants = Array.isArray(exp.participants) ? exp.participants : [];
    const myPaid = payers
      .filter((p) => myMemberIds.has(p.member_id))
      .reduce((sum, p) => sum + p.paid_cents, 0);
    const myShare = participants
      .filter((p) => myMemberIds.has(p.member_id))
      .reduce((sum, p) => sum + p.share_cents, 0);
    const myNet = myPaid - myShare;
    const iPaid = payers.some((p) => myMemberIds.has(p.member_id));
    const payerLabel = iPaid ? "You" : payers[0]?.member?.display_name ?? "Someone";

    items.push({
      id: exp.id,
      type: "expense",
      group_id: exp.group.id,
      group_name: exp.group.name,
      created_at: exp.created_at,
      title: exp.item_name,
      subtitle: `${payerLabel} paid`,
      amount_cents: myNet !== 0 ? Math.abs(myNet) : exp.amount_cents,
      direction: myNet > 0 ? "in" : myNet < 0 ? "out" : "neutral",
      category: exp.category,
    });
  }

  for (const pay of paymentsRes.data ?? []) {
    if (!pay.group) continue;
    const fromMine = pay.from_member_id ? myMemberIds.has(pay.from_member_id) : false;
    const toMine = pay.to_member_id ? myMemberIds.has(pay.to_member_id) : false;
    const fromName = (pay.from_member_id && memberNames.get(pay.from_member_id)) || "Someone";
    const toName = (pay.to_member_id && memberNames.get(pay.to_member_id)) || "someone";
    const subtitle = toMine
      ? `${fromName} paid you`
      : fromMine
        ? `You paid ${toName}`
        : `${fromName} paid ${toName}`;

    items.push({
      id: pay.id,
      type: "payment",
      group_id: pay.group.id,
      group_name: pay.group.name,
      created_at: pay.created_at,
      title: pay.group.name,
      subtitle,
      amount_cents: pay.amount_cents,
      direction: toMine ? "in" : fromMine ? "out" : "neutral",
      category: null,
    });
  }

  items.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return { data: items.slice(0, limit), error: null };
}
