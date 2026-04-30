"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { cachedAuth } from "@/lib/supabase/queries";
import { addExpenseSchema, addExpensesBatchSchema, addItemizedExpenseSchema, updateExpenseSchema, updateItemizedExpenseSchema } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import {
  buildCustomExpenseRpcInput,
  buildEqualExpenseRpcInput,
  buildItemizedExpenseRpcInput,
  buildUpdateCustomExpenseRpcInput,
  buildUpdateEqualExpenseRpcInput,
  buildUpdateItemizedExpenseRpcInput,
  parseCreateExpenseRpcResult,
  type Expense,
  type ExpenseItem,
  type ExpenseItemParticipant,
  type ExpenseParticipant,
  type ExpensePayer,
} from "@template/supabase";
import { z } from "zod";

const idSchema = z.string().uuid("Invalid ID.");

export type ExpenseWithParticipants = Expense & {
  participants: ExpenseParticipant[];
  payers: ExpensePayer[];
  items?: (ExpenseItem & { item_participants: ExpenseItemParticipant[] })[];
};

type ExpenseWithParticipantsRow = Expense & {
  participants: ExpenseParticipant[] | null;
  payers: ExpensePayer[] | null;
  items: (ExpenseItem & { item_participants: ExpenseItemParticipant[] | null })[] | null;
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

    const { data: result, error } = await db.rpc("create_expense", {
      p_input: buildEqualExpenseRpcInput({
        groupId: group_id,
        itemName: item_name,
        amountCents: amount_cents,
        notes,
        participantIds: participant_ids,
        payers: payers.map((payer) => ({
          memberId: payer.member_id,
          paidCents: payer.paid_cents,
        })),
      }),
    });

    if (error) return { data: null, error: "Failed to add expense." };

    const expenseResult = parseCreateExpenseRpcResult(result);
    if (expenseResult.error) return { data: null, error: "Failed to add expense." };

    return expenseResult;
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
      const rpcInput = item.split_mode === "equal"
        ? buildEqualExpenseRpcInput({
            groupId: group_id,
            itemName: item.item_name,
            amountCents: item.amount_cents,
            notes: item.notes,
            participantIds: item.participant_ids,
            payers: item.payers.map((payer) => ({
              memberId: payer.member_id,
              paidCents: payer.paid_cents,
            })),
          })
        : buildCustomExpenseRpcInput({
            groupId: group_id,
            itemName: item.item_name,
            amountCents: item.amount_cents,
            notes: item.notes,
            customSplits: (item.custom_splits ?? []).map((split) => ({
              memberId: split.member_id,
              shareCents: split.share_cents,
            })),
            payers: item.payers.map((payer) => ({
              memberId: payer.member_id,
              paidCents: payer.paid_cents,
            })),
          });

      const { data: result, error } = await db.rpc("create_expense", {
        p_input: rpcInput,
      });

      if (error) return { data: null, error: "Failed to add expense." };

      const expenseResult = parseCreateExpenseRpcResult(result);
      if (expenseResult.error) return { data: null, error: "Failed to add expense." };
      if (expenseResult.data === null) return { data: null, error: "Failed to add expense." };

      inserted.push(expenseResult.data);
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

    const { data: result, error } = await db.rpc("create_itemized_expense", {
      p_input: buildItemizedExpenseRpcInput({
        groupId: group_id,
        itemName: item_name,
        amountCents: amount_cents,
        notes,
        payers: payers.map((payer) => ({
          memberId: payer.member_id,
          paidCents: payer.paid_cents,
        })),
        lineItems: line_items.map((lineItem) => ({
          name: lineItem.name,
          amountCents: lineItem.amount_cents,
          participantIds: lineItem.participant_ids,
        })),
      }),
    });

    if (error) return { data: null, error: "Failed to add itemized expense." };

    const expenseResult = parseCreateExpenseRpcResult(result);
    if (expenseResult.error) return { data: null, error: "Failed to add itemized expense." };

    return expenseResult;
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function updateExpense(input: unknown): Promise<ApiResponse<Expense>> {
  try {
    await assertAuth();

    const parsed = updateExpenseSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { expense_id, item_name, amount_cents, notes, split_mode, participant_ids, custom_splits, payers } = parsed.data;

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const rpcInput = split_mode === "equal"
      ? buildUpdateEqualExpenseRpcInput({
          expenseId: expense_id,
          itemName: item_name,
          amountCents: amount_cents,
          notes,
          participantIds: participant_ids,
          payers: payers.map((p) => ({ memberId: p.member_id, paidCents: p.paid_cents })),
        })
      : buildUpdateCustomExpenseRpcInput({
          expenseId: expense_id,
          itemName: item_name,
          amountCents: amount_cents,
          notes,
          customSplits: (custom_splits ?? []).map((s) => ({ memberId: s.member_id, shareCents: s.share_cents })),
          payers: payers.map((p) => ({ memberId: p.member_id, paidCents: p.paid_cents })),
        });

    const { data: result, error } = await db.rpc("update_expense", { p_input: rpcInput });
    if (error) return { data: null, error: "Failed to update expense." };

    const expenseResult = parseCreateExpenseRpcResult(result);
    if (expenseResult.error) return { data: null, error: "Failed to update expense." };

    return expenseResult;
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function updateItemizedExpense(input: unknown): Promise<ApiResponse<Expense>> {
  try {
    await assertAuth();

    const parsed = updateItemizedExpenseSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { expense_id, item_name, amount_cents, notes, payers, line_items } = parsed.data;

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("update_itemized_expense", {
      p_input: buildUpdateItemizedExpenseRpcInput({
        expenseId: expense_id,
        itemName: item_name,
        amountCents: amount_cents,
        notes,
        payers: payers.map((p) => ({ memberId: p.member_id, paidCents: p.paid_cents })),
        lineItems: line_items.map((li) => ({
          name: li.name,
          amountCents: li.amount_cents,
          participantIds: li.participant_ids,
        })),
      }),
    });

    if (error) return { data: null, error: "Failed to update itemized expense." };

    const expenseResult = parseCreateExpenseRpcResult(result);
    if (expenseResult.error) return { data: null, error: "Failed to update itemized expense." };

    return expenseResult;
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
      data: ((expenses ?? []) as ExpenseWithParticipantsRow[]).map((expense) => ({
        ...expense,
        participants: expense.participants ?? [],
        payers: expense.payers ?? [],
        items: (expense.items ?? []).map((item) => ({
          ...item,
          item_participants: item.item_participants ?? [],
        })),
      })),
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
