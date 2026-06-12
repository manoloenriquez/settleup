"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import type { ApiResponse } from "@template/shared";
import { z } from "zod";

const createSchema = z
  .object({
    group_id: z.string().uuid(),
    item_name: z.string().trim().min(1).max(120),
    amount_cents: z.number().int().positive().max(100_000_000),
    category_id: z.string().uuid().nullable().optional(),
    payer_member_id: z.string().uuid(),
    participant_member_ids: z.array(z.string().uuid()).min(1),
    cadence: z.enum(["weekly", "monthly"]),
    payers: z
      .array(z.object({ member_id: z.string().uuid(), paid_cents: z.number().int().positive() }))
      .min(1)
      .max(20)
      .optional(),
  })
  .refine(
    (input) =>
      !input.payers || input.payers.reduce((sum, p) => sum + p.paid_cents, 0) === input.amount_cents,
    { message: "Payer total must equal the expense amount." },
  )
  .refine(
    (input) =>
      !input.payers || new Set(input.payers.map((p) => p.member_id)).size === input.payers.length,
    { message: "Each member can only appear once as a payer." },
  );

const idSchema = z.string().uuid();

export type RecurringExpense = {
  id: string;
  group_id: string;
  item_name: string;
  amount_cents: number;
  category_id: string | null;
  payer_member_id: string;
  participant_member_ids: string[];
  cadence: string;
  next_run_at: string;
  active: boolean;
  payers: { member_id: string; paid_cents: number }[] | null;
};

export async function listRecurringExpenses(groupId: string): Promise<ApiResponse<RecurringExpense[]>> {
  try {
    const parsed = idSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: "Invalid group ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const { data, error } = await supabase
      .schema("settleup")
      .from("recurring_expenses")
      .select("id, group_id, item_name, amount_cents, category_id, payer_member_id, participant_member_ids, cadence, next_run_at, active, payers")
      .eq("group_id", parsed.data)
      .order("created_at", { ascending: true });

    if (error) return { data: null, error: "Failed to load recurring expenses." };
    return { data: (data ?? []) as RecurringExpense[], error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

/**
 * Creates a recurring template. The first instance is the expense the user
 * just added, so next_run_at starts one cadence interval from today.
 */
export async function createRecurringExpense(input: unknown): Promise<ApiResponse<void>> {
  try {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const user = await assertAuth();
    const supabase = await createSettleUpDb();

    const next = new Date();
    if (parsed.data.cadence === "weekly") next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);

    const { error } = await supabase
      .schema("settleup")
      .from("recurring_expenses")
      .insert({
        group_id: parsed.data.group_id,
        item_name: parsed.data.item_name,
        amount_cents: parsed.data.amount_cents,
        category_id: parsed.data.category_id ?? null,
        payer_member_id: parsed.data.payers?.[0]?.member_id ?? parsed.data.payer_member_id,
        participant_member_ids: parsed.data.participant_member_ids,
        cadence: parsed.data.cadence,
        next_run_at: next.toISOString().slice(0, 10),
        payers: parsed.data.payers && parsed.data.payers.length > 1 ? parsed.data.payers : null,
        created_by_user_id: user.id,
      });

    if (error) return { data: null, error: "Failed to save recurring expense." };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function setRecurringExpenseActive(id: string, active: boolean): Promise<ApiResponse<void>> {
  try {
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return { data: null, error: "Invalid ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const { error } = await supabase
      .schema("settleup")
      .from("recurring_expenses")
      .update({ active })
      .eq("id", parsed.data);

    if (error) return { data: null, error: "Failed to update recurring expense." };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function deleteRecurringExpense(id: string): Promise<ApiResponse<void>> {
  try {
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return { data: null, error: "Invalid ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const { error } = await supabase
      .schema("settleup")
      .from("recurring_expenses")
      .delete()
      .eq("id", parsed.data);

    if (error) return { data: null, error: "Failed to delete recurring expense." };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}
