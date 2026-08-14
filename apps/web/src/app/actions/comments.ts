"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import type { ApiResponse } from "@template/shared";
import { z } from "zod";

const expenseIdSchema = z.string().uuid("Invalid expense ID.");
const commentIdSchema = z.string().uuid("Invalid comment ID.");
const addSchema = z.object({
  /** Optional client-generated id (idempotency key for offline/flaky retries). */
  id: z.string().uuid().optional(),
  expense_id: z.string().uuid(),
  body: z.string().trim().min(1, "Comment cannot be empty.").max(500),
});

export type ExpenseComment = {
  id: string;
  expense_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
};

export async function listExpenseComments(expenseId: string): Promise<ApiResponse<ExpenseComment[]>> {
  try {
    const parsed = expenseIdSchema.safeParse(expenseId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid expense ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const { data, error } = await supabase
      .schema("settleup")
      .from("expense_comments")
      .select("id, expense_id, author_user_id, body, created_at")
      .eq("expense_id", parsed.data)
      .order("created_at", { ascending: true });

    if (error) return { data: null, error: "Failed to load comments." };
    return { data: (data ?? []) as ExpenseComment[], error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function addExpenseComment(input: unknown): Promise<ApiResponse<ExpenseComment>> {
  try {
    const parsed = addSchema.safeParse(input);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };

    const user = await assertAuth();
    const supabase = await createSettleUpDb();
    const { data, error } = await supabase
      .schema("settleup")
      .from("expense_comments")
      .insert({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        expense_id: parsed.data.expense_id,
        author_user_id: user.id,
        body: parsed.data.body,
      })
      .select("id, expense_id, author_user_id, body, created_at")
      .single();

    if (error || !data) return { data: null, error: "Failed to add comment." };
    return { data: data as ExpenseComment, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function deleteExpenseComment(commentId: string): Promise<ApiResponse<void>> {
  try {
    const parsed = commentIdSchema.safeParse(commentId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid comment ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const { error } = await supabase
      .schema("settleup")
      .from("expense_comments")
      .delete()
      .eq("id", parsed.data);

    if (error) return { data: null, error: "Failed to delete comment." };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}
