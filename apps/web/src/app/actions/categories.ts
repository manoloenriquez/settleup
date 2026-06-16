"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { expenseCategoryInputSchema, updateExpenseCategorySchema, DEFAULT_CATEGORY_COLOR } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import type { ExpenseCategory } from "@template/supabase";
import { z } from "zod";

const groupIdSchema = z.string().uuid("Invalid group ID.");
const categoryIdSchema = z.string().uuid("Invalid category ID.");

const categoryRpcResultSchema = z.object({
  category: z.object({
    id: z.string().uuid(),
    group_id: z.string().uuid().nullable(),
    name: z.string(),
    slug: z.string(),
    icon: z.string(),
    color: z.string(),
    sort_order: z.number().int(),
    is_default: z.boolean(),
    created_by_user_id: z.string().uuid().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
});

export async function listExpenseCategories(groupId: string): Promise<ApiResponse<ExpenseCategory[]>> {
  try {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid group ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { data, error } = await db
      .from("expense_categories")
      .select("*")
      .or(`group_id.is.null,group_id.eq.${parsed.data}`)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) return { data: null, error: "Failed to load categories." };
    return { data: data ?? [], error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function createExpenseCategory(input: unknown): Promise<ApiResponse<ExpenseCategory>> {
  try {
    await assertAuth();
    const parsed = expenseCategoryInputSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid category." };
    }

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { data: result, error } = await db.rpc("create_expense_category", {
      p_group_id: parsed.data.group_id,
      p_name: parsed.data.name,
      p_icon: parsed.data.icon ?? "circle-ellipsis",
      p_color: parsed.data.color ?? DEFAULT_CATEGORY_COLOR,
    });

    if (error) return { data: null, error: error.message };

    const parsedResult = categoryRpcResultSchema.safeParse(result);
    if (!parsedResult.success) return { data: null, error: "Failed to parse category." };

    return { data: parsedResult.data.category, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function updateExpenseCategory(input: unknown): Promise<ApiResponse<ExpenseCategory>> {
  try {
    await assertAuth();
    const parsed = updateExpenseCategorySchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid category." };
    }

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { data: result, error } = await db.rpc("update_expense_category", {
      p_category_id: parsed.data.category_id,
      p_name: parsed.data.name,
      p_icon: parsed.data.icon ?? "circle-ellipsis",
      p_color: parsed.data.color ?? DEFAULT_CATEGORY_COLOR,
      p_sort_order: parsed.data.sort_order ?? null,
    });

    if (error) return { data: null, error: error.message };

    const parsedResult = categoryRpcResultSchema.safeParse(result);
    if (!parsedResult.success) return { data: null, error: "Failed to parse category." };

    return { data: parsedResult.data.category, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function deleteExpenseCategory(categoryId: string): Promise<ApiResponse<void>> {
  try {
    const parsed = categoryIdSchema.safeParse(categoryId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid category ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");
    const { error } = await db.rpc("delete_expense_category", {
      p_category_id: parsed.data,
    });

    if (error) return { data: null, error: error.message };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}
