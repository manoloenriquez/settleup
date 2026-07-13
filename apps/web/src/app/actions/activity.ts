"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { AuthError } from "@/lib/supabase/guards";
import { cachedAuth } from "@/lib/supabase/queries";
import type { ApiResponse } from "@template/shared";
import { z } from "zod";

const groupIdSchema = z.string().uuid("Invalid group ID.");

export type ActivityItem = {
  id: string;
  type: "expense" | "payment";
  created_at: string;
  // Expense fields
  item_name?: string;
  amount_cents: number;
  payer_names?: string[];
  participant_count?: number;
  category?: {
    id: string;
    name: string;
    slug: string;
    icon: string;
    color: string;
    is_default: boolean;
  } | null;
  // Payment fields
  from_name?: string;
  to_name?: string;
};

export async function getGroupActivity(
  groupId: string,
): Promise<ApiResponse<ActivityItem[]>> {
  try {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid group ID." };

    await cachedAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    // Fetch members, expenses, and payments all in parallel
    const [membersResult, expensesResult, paymentsResult] = await Promise.all([
      db
        .from("group_members")
        .select("id, display_name")
        .eq("group_id", parsed.data),
      db
        .from("expenses")
        .select("id, item_name, amount_cents, created_at, category:expense_categories(id, name, slug, icon, color, is_default), payers:expense_payers(member_id), participants:expense_participants(member_id)")
        .eq("group_id", parsed.data)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("payments")
        .select("id, amount_cents, from_member_id, to_member_id, created_at")
        .eq("group_id", parsed.data)
        .eq("status", "PAID")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (membersResult.error) return { data: null, error: "Failed to load activity." };
    if (expensesResult.error) return { data: null, error: "Failed to load activity." };
    if (paymentsResult.error) return { data: null, error: "Failed to load activity." };

    const memberMap = new Map((membersResult.data ?? []).map((m) => [m.id, m.display_name]));

    const activities: ActivityItem[] = [];

    for (const exp of expensesResult.data ?? []) {
      const payers = Array.isArray(exp.payers) ? exp.payers : [];
      const participants = Array.isArray(exp.participants) ? exp.participants : [];
      const payerNames = payers
        .map((p) => memberMap.get(p.member_id) ?? "Unknown")
        ;
      activities.push({
        id: exp.id,
        type: "expense",
        created_at: exp.created_at,
        item_name: exp.item_name,
        amount_cents: exp.amount_cents,
        payer_names: payerNames,
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

    // Sort by created_at descending
    activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { data: activities.slice(0, 30), error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

const limitSchema = z.number().int().min(1).max(100);

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
  try {
    const parsedLimit = limitSchema.safeParse(limit);
    if (!parsedLimit.success) return { data: null, error: "Invalid limit." };

    const user = await cachedAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    // RLS scopes every query to groups the viewer can access — no group filter.
    const [myMembersResult, expensesResult, paymentsResult] = await Promise.all([
      db.from("group_members").select("id").eq("user_id", user.id),
      db
        .from("expenses")
        .select(
          "id, group_id, item_name, amount_cents, created_at, group:groups(id, name), category:expense_categories(id, name, slug, icon, color, is_default), payers:expense_payers(member_id, paid_cents, member:group_members(display_name)), participants:expense_participants(member_id, share_cents)",
        )
        .order("created_at", { ascending: false })
        .limit(parsedLimit.data),
      db
        .from("payments")
        .select("id, group_id, amount_cents, created_at, from_member_id, to_member_id, group:groups(id, name)")
        .eq("status", "PAID")
        .order("created_at", { ascending: false })
        .limit(parsedLimit.data),
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
    const memberNames = new Map(
      (paymentMembersResult.data ?? []).map((m) => [m.id, m.display_name]),
    );

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
      const payerNames = payers.map((p) => p.member?.display_name ?? "Unknown");
      const iPaid = payers.some((p) => myMemberIds.has(p.member_id));
      const payerLabel = iPaid ? "You" : payerNames[0] ?? "Someone";

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

    items.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return { data: items.slice(0, parsedLimit.data), error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}
