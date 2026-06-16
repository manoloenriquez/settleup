"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import type { ApiResponse, LedgerExpense, LedgerPayment } from "@template/shared";
import { z } from "zod";

const groupIdSchema = z.string().uuid("Invalid group ID.");

export type GroupLedger = {
  group_name: string;
  expenses: LedgerExpense[];
  payments: LedgerPayment[];
};

export async function getGroupLedger(groupId: string): Promise<ApiResponse<GroupLedger>> {
  try {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid group ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const [groupRes, membersRes, expensesRes, paymentsRes] = await Promise.all([
      db.from("groups").select("name").eq("id", parsed.data).single(),
      db.from("group_members").select("id, display_name").eq("group_id", parsed.data),
      db
        .from("expenses")
        .select("item_name, amount_cents, notes, created_at, category:expense_categories(name), payers:expense_payers(member_id), participants:expense_participants(member_id)")
        .eq("group_id", parsed.data)
        .order("created_at", { ascending: true }),
      db
        .from("payments")
        .select("from_member_id, to_member_id, amount_cents, status, created_at")
        .eq("group_id", parsed.data)
        .order("created_at", { ascending: true }),
    ]);

    if (groupRes.error || expensesRes.error || paymentsRes.error || membersRes.error) {
      return { data: null, error: "Failed to load group data for export." };
    }

    const nameById = new Map((membersRes.data ?? []).map((m) => [m.id, m.display_name]));
    const name = (id: string): string => nameById.get(id) ?? "Unknown";

    const expenses: LedgerExpense[] = (expensesRes.data ?? []).map((e) => ({
      item_name: e.item_name,
      amount_cents: e.amount_cents,
      created_at: e.created_at,
      payer_names: (e.payers ?? []).map((p) => name(p.member_id)),
      participant_names: (e.participants ?? []).map((p) => name(p.member_id)),
      category_name: (e.category as { name: string } | null)?.name ?? null,
      notes: e.notes,
    }));

    const payments: LedgerPayment[] = (paymentsRes.data ?? []).map((p) => ({
      from_name: name(p.from_member_id),
      to_name: name(p.to_member_id),
      amount_cents: p.amount_cents,
      created_at: p.created_at,
      status: p.status,
    }));

    return { data: { group_name: groupRes.data.name, expenses, payments }, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}
