"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import type { ApiResponse } from "@template/shared";
import type { Payment } from "@template/supabase";

export async function markPaid(
  memberId: string,
  groupId: string,
  amountCents: number,
): Promise<ApiResponse<Payment>> {
  try {
    await assertAuth();
    const db = await createSettleUpDb();

    const { data, error } = await db
      .from("payments")
      .insert({ member_id: memberId, group_id: groupId, amount_cents: amountCents })
      .select()
      .single();

    if (error || !data) return { data: null, error: error?.message ?? "Failed to record payment." };
    return { data, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    throw e;
  }
}

export async function undoLastPayment(memberId: string): Promise<ApiResponse<void>> {
  try {
    await assertAuth();
    const db = await createSettleUpDb();

    // Find most recent payment for member
    const { data: latest, error: fetchError } = await db
      .from("payments")
      .select("id")
      .eq("member_id", memberId)
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
