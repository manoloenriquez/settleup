"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { cachedAuth } from "@/lib/supabase/queries";
import { logServerError } from "@/lib/log";
import { API_LIMITS, addExpenseSchema, addExpensesBatchSchema, addItemizedExpenseSchema, updateExpenseSchema, updateItemizedExpenseSchema } from "@template/shared";
import type { ApiResponse, PaginatedResponse } from "@template/shared";
import {
  buildCustomExpenseRpcInput,
  buildEqualExpenseRpcInput,
  buildExpensesBatchRpcInput,
  buildItemizedExpenseRpcInput,
  buildUpdateCustomExpenseRpcInput,
  buildUpdateEqualExpenseRpcInput,
  buildUpdateItemizedExpenseRpcInput,
  parseCreateExpenseRpcResult,
  parseCreateExpensesBatchRpcResult,
  type Expense,
  type ExpenseCategory,
  type ExpenseItem,
  type ExpenseItemParticipant,
  type ExpenseParticipant,
  type ExpensePayer,
  type Json,
} from "@template/supabase";
import { z } from "zod";

const idSchema = z.string().uuid("Invalid ID.");

export type ExpenseWithParticipants = Expense & {
  category: ExpenseCategory | null;
  participants: ExpenseParticipant[];
  payers: ExpensePayer[];
  items?: (ExpenseItem & { item_participants: ExpenseItemParticipant[] })[];
};

type ExpenseWithParticipantsRow = Expense & {
  category: ExpenseCategory | null;
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

    const { group_id, category_id, item_name, amount_cents, notes, expense_date, participant_ids, payers } = parsed.data;

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("create_expense", {
      p_input: buildEqualExpenseRpcInput({
        groupId: group_id,
        categoryId: category_id,
        itemName: item_name,
        amountCents: amount_cents,
        notes,
        expenseDate: expense_date,
        participantIds: participant_ids,
        payers: payers.map((payer) => ({
          memberId: payer.member_id,
          paidCents: payer.paid_cents,
        })),
      }),
    });

    if (error) {
      logServerError("create_expense", error);
      return { data: null, error: "Failed to add expense." };
    }

    const expenseResult = parseCreateExpenseRpcResult(result);
    if (expenseResult.error) return { data: null, error: "Failed to add expense." };

    return expenseResult;
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    logServerError("addExpense", e);
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

    const rpcItems: Json[] = items.map((item) =>
      item.split_mode === "equal"
        ? buildEqualExpenseRpcInput({
            groupId: group_id,
            categoryId: item.category_id,
            itemName: item.item_name,
            amountCents: item.amount_cents,
            notes: item.notes,
            expenseDate: item.expense_date,
            participantIds: item.participant_ids,
            payers: item.payers.map((payer) => ({
              memberId: payer.member_id,
              paidCents: payer.paid_cents,
            })),
          })
        : buildCustomExpenseRpcInput({
            groupId: group_id,
            categoryId: item.category_id,
            itemName: item.item_name,
            amountCents: item.amount_cents,
            notes: item.notes,
            expenseDate: item.expense_date,
            customSplits: (item.custom_splits ?? []).map((split) => ({
              memberId: split.member_id,
              shareCents: split.share_cents,
            })),
            payers: item.payers.map((payer) => ({
              memberId: payer.member_id,
              paidCents: payer.paid_cents,
            })),
          }),
    );

    // Single RPC = single transaction: a failure on any item rolls back the
    // whole batch instead of leaving earlier expenses committed.
    const { data: result, error } = await db.rpc("create_expenses_batch", {
      p_input: buildExpensesBatchRpcInput(group_id, rpcItems),
    });

    if (error) {
      logServerError("create_expenses_batch", error);
      return { data: null, error: "Failed to add expenses." };
    }

    const batchResult = parseCreateExpensesBatchRpcResult(result);
    if (batchResult.error || batchResult.data === null) {
      return { data: null, error: "Failed to add expenses." };
    }

    return { data: batchResult.data, error: null };
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

    const { group_id, category_id, item_name, amount_cents, notes, expense_date, payers, line_items } = parsed.data;

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("create_itemized_expense", {
      p_input: buildItemizedExpenseRpcInput({
        groupId: group_id,
        categoryId: category_id,
        itemName: item_name,
        amountCents: amount_cents,
        notes,
        expenseDate: expense_date,
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

    const { expense_id, category_id, item_name, amount_cents, notes, expense_date, split_mode, participant_ids, custom_splits, payers } = parsed.data;

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const rpcInput = split_mode === "equal"
      ? buildUpdateEqualExpenseRpcInput({
          expenseId: expense_id,
          categoryId: category_id,
          itemName: item_name,
          amountCents: amount_cents,
          notes,
          expenseDate: expense_date,
          participantIds: participant_ids,
          payers: payers.map((p) => ({ memberId: p.member_id, paidCents: p.paid_cents })),
        })
      : buildUpdateCustomExpenseRpcInput({
          expenseId: expense_id,
          categoryId: category_id,
          itemName: item_name,
          amountCents: amount_cents,
          notes,
          expenseDate: expense_date,
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

    const { expense_id, category_id, item_name, amount_cents, notes, expense_date, payers, line_items } = parsed.data;

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("update_itemized_expense", {
      p_input: buildUpdateItemizedExpenseRpcInput({
        expenseId: expense_id,
        categoryId: category_id,
        itemName: item_name,
        amountCents: amount_cents,
        notes,
        expenseDate: expense_date,
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
  page = 1,
  pageSize: number = API_LIMITS.EXPENSES_PAGE_SIZE,
): Promise<ApiResponse<PaginatedResponse<ExpenseWithParticipants>>> {
  try {
    const parsed = idSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid group ID." };

    const safePage = Math.max(1, Math.floor(page));
    const safePageSize = Math.min(Math.max(1, Math.floor(pageSize)), API_LIMITS.MAX_PAGE_SIZE);
    const from = (safePage - 1) * safePageSize;

    await cachedAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: expenses, error, count } = await db
      .from("expenses")
      .select("*, category:expense_categories(*), participants:expense_participants(*), payers:expense_payers(*), items:expense_items(*, item_participants:expense_item_participants(*))", { count: "exact" })
      .eq("group_id", parsed.data)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + safePageSize - 1);

    if (error) return { data: null, error: "Failed to load expenses." };

    const total = count ?? 0;
    return {
      data: {
        data: ((expenses ?? []) as ExpenseWithParticipantsRow[]).map((expense) => ({
          ...expense,
          participants: expense.participants ?? [],
          payers: expense.payers ?? [],
          items: (expense.items ?? []).map((item) => ({
            ...item,
            item_participants: item.item_participants ?? [],
          })),
        })),
        count: total,
        page: safePage,
        pageSize: safePageSize,
        totalPages: Math.ceil(total / safePageSize),
      },
      error: null,
    };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export type ExpenseSummary = {
  id: string;
  item_name: string;
  amount_cents: number;
  expense_date: string;
  created_at: string;
  category: ExpenseCategory | null;
  payers: { member_id: string; paid_cents: number }[];
  participants: { member_id: string; share_cents: number }[];
};

/**
 * Lightweight, unpaginated projection of every expense in a group — enough
 * for totals, budget progress, settled-%, insights, and charts to stay
 * correct while the full expense list is paginated.
 */
export async function listExpenseSummaries(
  groupId: string,
): Promise<ApiResponse<ExpenseSummary[]>> {
  try {
    const parsed = idSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid group ID." };

    await cachedAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: rows, error } = await db
      .from("expenses")
      .select("id, item_name, amount_cents, expense_date, created_at, category:expense_categories(*), payers:expense_payers(member_id, paid_cents), participants:expense_participants(member_id, share_cents)")
      .eq("group_id", parsed.data)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return { data: null, error: "Failed to load expense summaries." };

    type SummaryRow = Omit<ExpenseSummary, "payers" | "participants"> & {
      payers: ExpenseSummary["payers"] | null;
      participants: ExpenseSummary["participants"] | null;
    };

    return {
      data: ((rows ?? []) as unknown as SummaryRow[]).map((row) => ({
        ...row,
        payers: row.payers ?? [],
        participants: row.participants ?? [],
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
