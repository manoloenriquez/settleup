"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { recordPaymentSchema } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import type { Payment } from "@template/supabase";
import { z } from "zod";

const memberIdSchema = z.string().uuid("Invalid member ID.");

export async function recordPayment(input: unknown): Promise<ApiResponse<Payment>> {
  try {
    const user = await assertAuth();

    const parsed = recordPaymentSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { group_id, from_member_id, to_member_id, amount_cents } = parsed.data;

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data, error } = await db
      .from("payments")
      .insert({
        group_id,
        amount_cents,
        from_member_id,
        to_member_id,
        created_by_user_id: user.id,
      })
      .select()
      .single();

    if (error || !data) return { data: null, error: error?.message ?? "Failed to record payment." };
    return { data, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function undoLastPayment(fromMemberId: string): Promise<ApiResponse<void>> {
  try {
    const parsed = memberIdSchema.safeParse(fromMemberId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid member ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    // Find most recent payment from this member
    const { data: latest, error: fetchError } = await db
      .from("payments")
      .select("id")
      .eq("from_member_id", parsed.data)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !latest) {
      return { data: null, error: "No payment found to undo." };
    }

    const { error } = await db.from("payments").delete().eq("id", latest.id);
    if (error) return { data: null, error: error.message };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}
