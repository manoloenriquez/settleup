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
    const groupId = group.id;

    // Create 7 members — Manolo is linked to the current user
    const memberNames = ["Manolo", "Yao", "Alvaro", "Dustin", "Mikee", "John", "Jane"];
    const slugs: string[] = [];
    const memberRows = memberNames.map((name) => {
      const slug = generateSlug(name, slugs);
      slugs.push(slug);
      return {
        group_id: groupId,
        display_name: name,
        slug,
        share_token: generateShareToken(),
        user_id: name === "Manolo" ? user.id : null,
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
    const manoloId = byName.get("Manolo")!;

    // Helper to insert expense + participants + payer (Manolo pays all)
    async function insertExpense(
      itemName: string,
      amountCents: number,
      participantIds: string[],
    ): Promise<void> {
      const sortedIds = [...participantIds].sort();
      const { data: exp, error: expError } = await db
        .from("expenses")
        .insert({
          group_id: groupId,
          item_name: itemName,
          amount_cents: amountCents,
          created_by_user_id: user.id,
        })
        .select()
        .single();
      if (expError || !exp) throw new Error(expError?.message ?? `${itemName} failed`);

      const shares = equalSplit(amountCents, sortedIds.length);
      await db.from("expense_participants").insert(
        sortedIds.map((id, i) => ({ expense_id: exp.id, member_id: id, share_cents: shares[i]! })),
      );

      // Manolo is the payer for all seeded expenses
      await db.from("expense_payers").insert({
        expense_id: exp.id,
        member_id: manoloId,
        paid_cents: amountCents,
      });
    }

    // Expense 1: Wahunori ₱8,703.39 split 7-way
    const allIds = members.map((m) => m.id);
    await insertExpense("Wahunori", 870339, allIds);

    // Expense 2: Green Pepper ₱2,717.00 split 4-way (Manolo, Yao, Alvaro, Dustin)
    const ids2 = (["Manolo", "Yao", "Alvaro", "Dustin"] as const)
      .map((n) => byName.get(n)!)
      .filter(Boolean);
    await insertExpense("Green Pepper", 271700, ids2);

    // Expense 3: Eastwing/Raion ₱8,299.98 split 3-way (Manolo, Yao, Alvaro)
    const ids3 = (["Manolo", "Yao", "Alvaro"] as const)
      .map((n) => byName.get(n)!)
      .filter(Boolean);
    await insertExpense("Eastwing/Raion", 829998, ids3);

    return { data: { groupId }, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
