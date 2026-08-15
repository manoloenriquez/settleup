import { supabase } from "@/lib/supabase/client";
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

  if (error) return { data: null, error: "Failed to load categories." };
  return { data: data ?? [], error: null };
}
