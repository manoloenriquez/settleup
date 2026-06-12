import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";

export type ExpenseComment = {
  id: string;
  expense_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
};

export async function listExpenseComments(expenseId: string): Promise<ApiResponse<ExpenseComment[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("expense_comments")
    .select("id, expense_id, author_user_id, body, created_at")
    .eq("expense_id", expenseId)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as ExpenseComment[], error: null };
}

export async function addExpenseComment(params: {
  expenseId: string;
  authorUserId: string;
  body: string;
}): Promise<ApiResponse<ExpenseComment>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("expense_comments")
    .insert({ expense_id: params.expenseId, author_user_id: params.authorUserId, body: params.body })
    .select("id, expense_id, author_user_id, body, created_at")
    .single();

  if (error || !data) return { data: null, error: error?.message ?? "Failed to add comment" };
  return { data: data as ExpenseComment, error: null };
}

export async function deleteExpenseComment(commentId: string): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .schema("settleup")
    .from("expense_comments")
    .delete()
    .eq("id", commentId);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}
