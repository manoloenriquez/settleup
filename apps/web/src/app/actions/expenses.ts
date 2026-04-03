"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { cachedAuth } from "@/lib/supabase/queries";
import { addExpenseSchema, addExpensesBatchSchema, addItemizedExpenseSchema } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import type { Expense, ExpenseItem, ExpenseItemParticipant, ExpenseParticipant, ExpensePayer } from "@template/supabase";
import { z } from "zod";

const idSchema = z.string().uuid("Invalid ID.");

export type ExpenseWithParticipants = Expense & {
  participants: ExpenseParticipant[];
  payers: ExpensePayer[];
  items?: (ExpenseItem & { item_participants: ExpenseItemParticipant[] })[];
};

export async function addExpense(input: unknown): Promise<ApiResponse<Expense>> {
  try {
    await assertAuth();

    const parsed = addExpenseSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { group_id, item_name, amount_cents, notes, participant_ids, payers } = parsed.data;

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("create_expense" as never, {
      p_input: {
        group_id,
        item_name,
        amount_cents,
        notes,
        split_mode: "equal",
        participant_ids: [...participant_ids].sort(),
        payers,
      },
    } as never);

    if (error) return { data: null, error: "Failed to add expense." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expense = (result as any)?.expense as Expense;
    if (!expense) return { data: null, error: "Failed to add expense." };

    return { data: expense, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function addExpensesBatch(input: unknown): Promise<ApiResponse<Expense[]>> {
  try {
    await assertAuth();

    const parsed = addExpensesBatchSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { group_id, items } = parsed.data;
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const inserted: Expense[] = [];

    for (const item of items) {
      let rpcInput: Record<string, unknown>;

      if (item.split_mode === "equal") {
        const sortedIds = [...item.participant_ids].sort();
        rpcInput = {
          group_id,
          item_name: item.item_name,
          amount_cents: item.amount_cents,
          notes: item.notes,
          split_mode: "equal",
          participant_ids: sortedIds,
          payers: item.payers,
        };
      } else {
        rpcInput = {
          group_id,
          item_name: item.item_name,
          amount_cents: item.amount_cents,
          notes: item.notes,
          split_mode: "custom",
          custom_splits: item.custom_splits,
          payers: item.payers,
        };
      }

      const { data: result, error } = await db.rpc("create_expense" as never, {
        p_input: rpcInput,
      } as never);

      if (error) return { data: null, error: "Failed to add expense." };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const expense = (result as any)?.expense as Expense;
      if (!expense) return { data: null, error: "Failed to add expense." };

      inserted.push(expense);
    }

    return { data: inserted, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function addItemizedExpense(input: unknown): Promise<ApiResponse<Expense>> {
  try {
    await assertAuth();

    const parsed = addItemizedExpenseSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { group_id, item_name, amount_cents, notes, payers, line_items } = parsed.data;

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("create_itemized_expense" as never, {
      p_input: {
        group_id,
        item_name,
        amount_cents,
        notes,
        payers,
        line_items: line_items.map((li) => ({
          name: li.name,
          amount_cents: li.amount_cents,
          participant_ids: [...li.participant_ids].sort(),
        })),
      },
    } as never);

    if (error) return { data: null, error: "Failed to add itemized expense." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expense = (result as any)?.expense as Expense;
    if (!expense) return { data: null, error: "Failed to add itemized expense." };

    return { data: expense, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function listExpenses(
  groupId: string,
): Promise<ApiResponse<ExpenseWithParticipants[]>> {
  try {
    const parsed = idSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid group ID." };

    await cachedAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: expenses, error } = await db
      .from("expenses")
      .select("*, participants:expense_participants(*), payers:expense_payers(*), items:expense_items(*, item_participants:expense_item_participants(*))")
      .eq("group_id", parsed.data)
      .order("created_at", { ascending: false });

    if (error) return { data: null, error: "Failed to load expenses." };

    return {
      data: (expenses ?? []) as ExpenseWithParticipants[],
      error: null,
    };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function deleteExpense(expenseId: string): Promise<ApiResponse<void>> {
  try {
    const parsed = idSchema.safeParse(expenseId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid expense ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { error } = await db.from("expenses").delete().eq("id", parsed.data);
    if (error) return { data: null, error: "Failed to delete expense." };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}
