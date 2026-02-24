"use server";

import { redirect } from "next/navigation";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { createClient } from "@/lib/supabase/server";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { createGroupSchema, generateSlug } from "@template/shared";
import { generateShareToken } from "@/lib/tokens";
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

    // Auto-link owner as first group member
    const publicClient = await createClient();
    const { data: profile } = await publicClient
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const ownerName = profile?.full_name || user.email?.split("@")[0] || "Me";
    const slug = generateSlug(ownerName, []);
    const share_token = generateShareToken();

    await db.from("group_members").insert({
      group_id: data.id,
      display_name: ownerName,
      slug,
      share_token,
      user_id: user.id,
    });

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

    // 3. Parallel: fetch all 4 sources for balance calculation
    const [sharesResult, payersResult, paymentsFromResult, paymentsToResult] = await Promise.all([
      db
        .from("expense_participants")
        .select("member_id, share_cents")
        .in("member_id", memberIds),
      db
        .from("expense_payers")
        .select("member_id, paid_cents")
        .in("member_id", memberIds),
      db
        .from("payments")
        .select("from_member_id, amount_cents")
        .in("from_member_id", memberIds),
      db
        .from("payments")
        .select("to_member_id, amount_cents")
        .in("to_member_id", memberIds),
    ]);

    if (sharesResult.error) return { data: null, error: sharesResult.error.message };
    if (payersResult.error) return { data: null, error: payersResult.error.message };
    if (paymentsFromResult.error) return { data: null, error: paymentsFromResult.error.message };
    if (paymentsToResult.error) return { data: null, error: paymentsToResult.error.message };

    // 4. Aggregate in memory: net = paid_as_payer - shares + received - sent
    const memberToGroup = new Map<string, string>();
    for (const m of members) {
      memberToGroup.set(m.id, m.group_id);
    }

    type MemberAgg = { paidAsPayer: number; shares: number; received: number; sent: number };
    const memberNet = new Map<string, MemberAgg>();
    for (const m of members) {
      memberNet.set(m.id, { paidAsPayer: 0, shares: 0, received: 0, sent: 0 });
    }

    for (const row of payersResult.data ?? []) {
      const ma = memberNet.get(row.member_id);
      if (ma) ma.paidAsPayer += row.paid_cents;
    }
    for (const row of sharesResult.data ?? []) {
      const ma = memberNet.get(row.member_id);
      if (ma) ma.shares += row.share_cents;
    }
    for (const row of paymentsToResult.data ?? []) {
      if (!row.to_member_id) continue;
      const ma = memberNet.get(row.to_member_id);
      if (ma) ma.received += row.amount_cents;
    }
    for (const row of paymentsFromResult.data ?? []) {
      if (!row.from_member_id) continue;
      const ma = memberNet.get(row.from_member_id);
      if (ma) ma.sent += row.amount_cents;
    }

    // Map: groupId -> member count
    const memberCountByGroup = new Map<string, number>();
    for (const m of members) {
      memberCountByGroup.set(m.group_id, (memberCountByGroup.get(m.group_id) ?? 0) + 1);
    }

    // pending_count per group: members with negative net (they owe money)
    const pendingCountByGroup = new Map<string, number>();
    const groupTotalOwed = new Map<string, number>();
    for (const gId of groupIds) {
      groupTotalOwed.set(gId, 0);
    }

    for (const m of members) {
      const ma = memberNet.get(m.id);
      if (!ma) continue;
      const net = ma.paidAsPayer - ma.shares + ma.received - ma.sent;
      if (net < 0) {
        pendingCountByGroup.set(m.group_id, (pendingCountByGroup.get(m.group_id) ?? 0) + 1);
        groupTotalOwed.set(m.group_id, (groupTotalOwed.get(m.group_id) ?? 0) + (-net));
      }
    }

    const result: GroupWithStats[] = groups.map((g) => ({
      ...g,
      member_count: memberCountByGroup.get(g.id) ?? 0,
      pending_count: pendingCountByGroup.get(g.id) ?? 0,
      total_owed_cents: groupTotalOwed.get(g.id) ?? 0,
    }));

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
