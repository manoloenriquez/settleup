"use server";

import { redirect } from "next/navigation";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { createGroupSchema } from "@template/shared";
import type { ApiResponse, GroupWithStats } from "@template/shared";
import type { Group } from "@template/supabase";

export async function createGroup(_: unknown, formData: FormData): Promise<ApiResponse<Group>> {
  try {
    const user = await assertAuth();

    const parsed = createGroupSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { data, error } = await db
      .from("groups")
      .insert({ name: parsed.data.name, owner_user_id: user.id })
      .select()
      .single();

    if (error || !data) return { data: null, error: error?.message ?? "Failed to create group." };

    redirect(`/groups/${data.id}`);
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function listGroups(): Promise<ApiResponse<Group[]>> {
  try {
    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { data, error } = await db
      .from("groups")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: false });

    if (error) return { data: null, error: error.message };
    return { data: data ?? [], error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function archiveGroup(groupId: string): Promise<ApiResponse<void>> {
  try {
    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { error } = await db
      .from("groups")
      .update({ is_archived: true })
      .eq("id", groupId);

    if (error) return { data: null, error: error.message };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function listGroupsWithStats(): Promise<ApiResponse<GroupWithStats[]>> {
  try {
    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    // 1. Fetch non-archived groups (RLS filters to current user)
    const { data: groups, error: groupsError } = await db
      .from("groups")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: false });

    if (groupsError) return { data: null, error: groupsError.message };
    if (!groups || groups.length === 0) return { data: [], error: null };

    const groupIds = groups.map((g) => g.id);

    // 2. Fetch all group members for these groups
    const { data: members, error: membersError } = await db
      .from("group_members")
      .select("id, group_id")
      .in("group_id", groupIds);

    if (membersError) return { data: null, error: membersError.message };
    if (!members || members.length === 0) {
      return {
        data: groups.map((g) => ({
          ...g,
          member_count: 0,
          pending_count: 0,
          total_owed_cents: 0,
        })),
        error: null,
      };
    }

    const memberIds = members.map((m) => m.id);

    // 3. Parallel: fetch expense_participants shares + payments
    const [sharesResult, paymentsResult] = await Promise.all([
      db
        .from("expense_participants")
        .select("member_id, share_cents")
        .in("member_id", memberIds),
      db
        .from("payments")
        .select("member_id, amount_cents")
        .in("member_id", memberIds),
    ]);

    if (sharesResult.error) return { data: null, error: sharesResult.error.message };
    if (paymentsResult.error) return { data: null, error: paymentsResult.error.message };

    // 4. Aggregate in memory
    // Map: memberId -> groupId
    const memberToGroup = new Map<string, string>();
    for (const m of members) {
      memberToGroup.set(m.id, m.group_id);
    }

    // Map: groupId -> { totalShares, totalPaid }
    type GroupAgg = { totalShares: number; totalPaid: number };
    const groupAgg = new Map<string, GroupAgg>();
    for (const gId of groupIds) {
      groupAgg.set(gId, { totalShares: 0, totalPaid: 0 });
    }

    for (const sp of sharesResult.data ?? []) {
      const gId = memberToGroup.get(sp.member_id);
      if (!gId) continue;
      const agg = groupAgg.get(gId);
      if (agg) agg.totalShares += sp.share_cents;
    }

    for (const pay of paymentsResult.data ?? []) {
      const gId = memberToGroup.get(pay.member_id);
      if (!gId) continue;
      const agg = groupAgg.get(gId);
      if (agg) agg.totalPaid += pay.amount_cents;
    }

    // Map: groupId -> member count
    const memberCountByGroup = new Map<string, number>();
    for (const m of members) {
      memberCountByGroup.set(m.group_id, (memberCountByGroup.get(m.group_id) ?? 0) + 1);
    }

    // Build per-member owed amounts to count pending members
    // Map: memberId -> { shares, paid }
    type MemberAgg = { shares: number; paid: number };
    const memberOwed = new Map<string, MemberAgg>();
    for (const m of members) {
      memberOwed.set(m.id, { shares: 0, paid: 0 });
    }
    for (const sp of sharesResult.data ?? []) {
      const ma = memberOwed.get(sp.member_id);
      if (ma) ma.shares += sp.share_cents;
    }
    for (const pay of paymentsResult.data ?? []) {
      const ma = memberOwed.get(pay.member_id);
      if (ma) ma.paid += pay.amount_cents;
    }

    // pending_count per group: members where shares > paid
    const pendingCountByGroup = new Map<string, number>();
    for (const m of members) {
      const ma = memberOwed.get(m.id);
      if (ma && ma.shares > ma.paid) {
        pendingCountByGroup.set(m.group_id, (pendingCountByGroup.get(m.group_id) ?? 0) + 1);
      }
    }

    const result: GroupWithStats[] = groups.map((g) => {
      const agg = groupAgg.get(g.id) ?? { totalShares: 0, totalPaid: 0 };
      return {
        ...g,
        member_count: memberCountByGroup.get(g.id) ?? 0,
        pending_count: pendingCountByGroup.get(g.id) ?? 0,
        total_owed_cents: Math.max(0, agg.totalShares - agg.totalPaid),
      };
    });

    return { data: result, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function deleteGroup(groupId: string): Promise<ApiResponse<void>> {
  try {
    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { error } = await db.from("groups").delete().eq("id", groupId);

    if (error) return { data: null, error: error.message };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
