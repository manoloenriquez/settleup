"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { generateSlug, equalSplit } from "@template/shared";
import { generateShareToken } from "@/lib/tokens";
import type { ApiResponse } from "@template/shared";

export async function seedDemoData(): Promise<ApiResponse<{ groupId: string }>> {
  if (process.env.NODE_ENV !== "development") {
    return { data: null, error: "Seed only available in development." };
  }

  try {
    const user = await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    // Create group
    const { data: group, error: groupError } = await db
      .from("groups")
      .insert({ name: "Barkada Trip 2025", owner_user_id: user.id })
      .select()
      .single();

    if (groupError || !group) {
      return { data: null, error: groupError?.message ?? "Failed to create group." };
    }

    // Create 7 members
    const memberNames = ["Manolo", "Yao", "Alvaro", "Dustin", "Mikee", "John", "Jane"];
    const slugs: string[] = [];
    const memberRows = memberNames.map((name) => {
      const slug = generateSlug(name, slugs);
      slugs.push(slug);
      return {
        group_id: group.id,
        display_name: name,
        slug,
        share_token: generateShareToken(),
      };
    });

    const { data: members, error: membersError } = await db
      .from("group_members")
      .insert(memberRows)
      .select();

    if (membersError || !members) {
      return { data: null, error: membersError?.message ?? "Failed to create members." };
    }

    const byName = new Map(members.map((m) => [m.display_name, m.id]));

    // Expense 1: Wahunori ₱8,703.39 split 7-way
    const allIds = members.map((m) => m.id).sort();
    const { data: exp1, error: exp1Error } = await db
      .from("expenses")
      .insert({ group_id: group.id, item_name: "Wahunori", amount_cents: 870339 })
      .select()
      .single();
    if (exp1Error || !exp1) return { data: null, error: exp1Error?.message ?? "exp1 failed" };
    const shares1 = equalSplit(870339, 7);
    await db.from("expense_participants").insert(
      allIds.map((id, i) => ({ expense_id: exp1.id, member_id: id, share_cents: shares1[i]! })),
    );

    // Expense 2: Green Pepper ₱2,717.00 split 4-way (Manolo, Yao, Alvaro, Dustin)
    const ids2 = (["Manolo", "Yao", "Alvaro", "Dustin"] as const)
      .map((n) => byName.get(n)!)
      .filter(Boolean)
      .sort();
    const { data: exp2, error: exp2Error } = await db
      .from("expenses")
      .insert({ group_id: group.id, item_name: "Green Pepper", amount_cents: 271700 })
      .select()
      .single();
    if (exp2Error || !exp2) return { data: null, error: exp2Error?.message ?? "exp2 failed" };
    const shares2 = equalSplit(271700, ids2.length);
    await db.from("expense_participants").insert(
      ids2.map((id, i) => ({ expense_id: exp2.id, member_id: id, share_cents: shares2[i]! })),
    );

    // Expense 3: Eastwing/Raion ₱8,299.98 split 3-way (Manolo, Yao, Alvaro)
    const ids3 = (["Manolo", "Yao", "Alvaro"] as const)
      .map((n) => byName.get(n)!)
      .filter(Boolean)
      .sort();
    const { data: exp3, error: exp3Error } = await db
      .from("expenses")
      .insert({ group_id: group.id, item_name: "Eastwing/Raion", amount_cents: 829998 })
      .select()
      .single();
    if (exp3Error || !exp3) return { data: null, error: exp3Error?.message ?? "exp3 failed" };
    const shares3 = equalSplit(829998, ids3.length);
    await db.from("expense_participants").insert(
      ids3.map((id, i) => ({ expense_id: exp3.id, member_id: id, share_cents: shares3[i]! })),
    );

    return { data: { groupId: group.id }, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
