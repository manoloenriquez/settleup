import { supabase } from "@/lib/supabase/client";
import type { ApiResponse } from "@template/shared";
import type { ActivityItem, RecentActivityItem } from "@/app/actions/activity";

/** Group timeline: recent expenses + PAID payments with member names resolved. */
export async function getGroupActivity(groupId: string): Promise<ApiResponse<ActivityItem[]>> {
  const db = supabase.schema("settleup");

  const [membersResult, expensesResult, paymentsResult] = await Promise.all([
    db.from("group_members").select("id, display_name").eq("group_id", groupId),
    db
      .from("expenses")
      .select("id, item_name, amount_cents, created_at, category:expense_categories(id, name, slug, icon, color, is_default), payers:expense_payers(member_id), participants:expense_participants(member_id)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("payments")
      .select("id, amount_cents, from_member_id, to_member_id, created_at")
      .eq("group_id", groupId)
      .eq("status", "PAID")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (membersResult.error || expensesResult.error || paymentsResult.error) {
    return { data: null, error: "Failed to load activity." };
  }

  const memberMap = new Map((membersResult.data ?? []).map((m) => [m.id, m.display_name]));
  const activities: ActivityItem[] = [];

  for (const exp of expensesResult.data ?? []) {
    const payers = Array.isArray(exp.payers) ? exp.payers : [];
    const participants = Array.isArray(exp.participants) ? exp.participants : [];
    activities.push({
      id: exp.id,
      type: "expense",
      created_at: exp.created_at,
      item_name: exp.item_name,
      amount_cents: exp.amount_cents,
      payer_names: payers.map((p) => memberMap.get(p.member_id) ?? "Unknown"),
      participant_count: participants.length,
      category: exp.category,
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

  activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return { data: activities.slice(0, 30), error: null };
}

/** Cross-group feed of how recent events moved the viewer's balance. */
export async function getRecentActivity(limit = 10): Promise<ApiResponse<RecentActivityItem[]>> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return { data: null, error: "Not signed in." };

  const db = supabase.schema("settleup");

  // RLS scopes every query to groups the viewer can access — no group filter.
  const [myMembersResult, expensesResult, paymentsResult] = await Promise.all([
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

  if (myMembersResult.error || expensesResult.error || paymentsResult.error) {
    return { data: null, error: "Failed to load activity." };
  }

  // payments has no FK to group_members, so embeds can't resolve names —
  // batch-fetch the referenced member rows instead.
  const paymentMemberIds = [
    ...new Set(
      (paymentsResult.data ?? [])
        .flatMap((p) => [p.from_member_id, p.to_member_id])
        .filter((id): id is string => id !== null),
    ),
  ];
  const paymentMembersResult = paymentMemberIds.length
    ? await db.from("group_members").select("id, display_name").in("id", paymentMemberIds)
    : { data: [], error: null };
  if (paymentMembersResult.error) {
    return { data: null, error: "Failed to load activity." };
  }
  const memberNames = new Map((paymentMembersResult.data ?? []).map((m) => [m.id, m.display_name]));

  const myMemberIds = new Set((myMembersResult.data ?? []).map((m) => m.id));
  const items: RecentActivityItem[] = [];

  for (const exp of expensesResult.data ?? []) {
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

  for (const pay of paymentsResult.data ?? []) {
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

  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return { data: items.slice(0, limit), error: null };
}
