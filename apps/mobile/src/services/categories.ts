import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";
import type { ExpenseCategory } from "@template/supabase";

export async function listExpenseCategories(groupId: string): Promise<ApiResponse<ExpenseCategory[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("expense_categories")
    .select("*")
    .or(`group_id.is.null,group_id.eq.${groupId}`)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

export async function createExpenseCategory(params: {
  groupId: string;
  name: string;
  color: string;
}): Promise<ApiResponse<ExpenseCategory>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("create_expense_category", {
      p_group_id: params.groupId,
      p_name: params.name,
      p_icon: "circle-ellipsis",
      p_color: params.color,
    });

  if (error) return { data: null, error: error.message };
  const result = data as { category?: ExpenseCategory } | null;
  if (!result?.category) return { data: null, error: "Failed to create category." };
  return { data: result.category, error: null };
}

export async function updateExpenseCategory(params: {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
}): Promise<ApiResponse<ExpenseCategory>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("update_expense_category", {
      p_category_id: params.categoryId,
      p_name: params.name,
      p_icon: params.icon,
      p_color: params.color,
      p_sort_order: params.sortOrder,
    });

  if (error) return { data: null, error: error.message };
  const result = data as { category?: ExpenseCategory } | null;
  if (!result?.category) return { data: null, error: "Failed to update category." };
  return { data: result.category, error: null };
}

export async function deleteExpenseCategory(categoryId: string): Promise<ApiResponse<null>> {
  const { error } = await supabase
    .schema("settleup")
    .rpc("delete_expense_category", { p_category_id: categoryId });

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}
