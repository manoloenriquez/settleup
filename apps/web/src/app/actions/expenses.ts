"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { addExpenseSchema, addExpensesBatchSchema, equalSplit } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import type { Expense, ExpenseParticipant, ExpensePayer } from "@template/supabase";

export type ExpenseWithParticipants = Expense & {
  participants: ExpenseParticipant[];
  payers: ExpensePayer[];
};

export async function addExpense(input: unknown): Promise<ApiResponse<Expense>> {
  try {
    const user = await assertAuth();

    const parsed = addExpenseSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { group_id, item_name, amount_cents, notes, participant_ids, payers } = parsed.data;

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    // Insert expense
    const { data: expense, error: expenseError } = await db
      .from("expenses")
      .insert({ group_id, item_name, amount_cents, notes, created_by_user_id: user.id })
      .select()
      .single();

    if (expenseError || !expense) {
      return { data: null, error: expenseError?.message ?? "Failed to add expense." };
    }

    // Sort participant IDs for deterministic remainder distribution
    const sortedIds = [...participant_ids].sort();
    const shares = equalSplit(amount_cents, sortedIds.length);

    const participantRows = sortedIds.map((member_id, i) => ({
      expense_id: expense.id,
      member_id,
      share_cents: shares[i]!,
    }));

    const { error: participantError } = await db
      .from("expense_participants")
      .insert(participantRows);

    if (participantError) {
      return { data: null, error: participantError.message };
    }

    // Insert expense payers
    const payerRows = payers.map((p) => ({
      expense_id: expense.id,
      member_id: p.member_id,
      paid_cents: p.paid_cents,
    }));

    const { error: payerError } = await db
      .from("expense_payers")
      .insert(payerRows);

    if (payerError) {
      return { data: null, error: payerError.message };
    }

    return { data: expense, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function addExpensesBatch(input: unknown): Promise<ApiResponse<Expense[]>> {
  try {
    const user = await assertAuth();

    const parsed = addExpensesBatchSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { group_id, items } = parsed.data;
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const inserted: Expense[] = [];

    for (const item of items) {
      const { data: expense, error: expenseError } = await db
        .from("expenses")
        .insert({ group_id, item_name: item.item_name, amount_cents: item.amount_cents, notes: item.notes, created_by_user_id: user.id })
        .select()
        .single();

      if (expenseError || !expense) {
        return { data: null, error: expenseError?.message ?? "Failed to add expense." };
      }

      let participantRows: { expense_id: string; member_id: string; share_cents: number }[];

      if (item.split_mode === "equal") {
        const sortedIds = [...item.participant_ids].sort();
        const shares = equalSplit(item.amount_cents, sortedIds.length);
        participantRows = sortedIds.map((member_id, i) => ({
          expense_id: expense.id,
          member_id,
          share_cents: shares[i]!,
        }));
      } else {
        // custom — validated by schema to sum correctly
        participantRows = (item.custom_splits ?? []).map((s) => ({
          expense_id: expense.id,
          member_id: s.member_id,
          share_cents: s.share_cents,
        }));
      }

      const { error: participantError } = await db
        .from("expense_participants")
        .insert(participantRows);

      if (participantError) {
        return { data: null, error: participantError.message };
      }

      // Insert expense payers
      const payerRows = item.payers.map((p) => ({
        expense_id: expense.id,
        member_id: p.member_id,
        paid_cents: p.paid_cents,
      }));

      const { error: payerError } = await db
        .from("expense_payers")
        .insert(payerRows);

      if (payerError) {
        return { data: null, error: payerError.message };
      }

      inserted.push(expense);
    }

    return { data: inserted, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function listExpenses(
  groupId: string,
): Promise<ApiResponse<ExpenseWithParticipants[]>> {
  try {
    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: expenses, error } = await db
      .from("expenses")
      .select("*, participants:expense_participants(*), payers:expense_payers(*)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });

    if (error) return { data: null, error: error.message };

    return {
      data: (expenses ?? []) as ExpenseWithParticipants[],
      error: null,
    };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function deleteExpense(expenseId: string): Promise<ApiResponse<void>> {
  try {
    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { error } = await db.from("expenses").delete().eq("id", expenseId);
    if (error) return { data: null, error: error.message };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
