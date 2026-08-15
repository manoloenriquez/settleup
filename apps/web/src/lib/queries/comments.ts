import { supabase } from "@/lib/supabase/client";
import type { ApiResponse } from "@template/shared";
import type { ExpenseComment } from "@/app/actions/comments";

export async function listExpenseComments(expenseId: string): Promise<ApiResponse<ExpenseComment[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("expense_comments")
    .select("id, expense_id, author_user_id, body, created_at")
    .eq("expense_id", expenseId)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: "Failed to load comments." };
  return { data: (data ?? []) as ExpenseComment[], error: null };
}
