"use server";

import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { logServerError } from "@/lib/log";
import { recordPaymentSchema } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import {
  parseRecordPaymentRpcResult,
  parseSuccessRpcResult,
  type Payment,
} from "@template/supabase";
import { z } from "zod";

const memberIdSchema = z.string().uuid("Invalid member ID.");
const groupIdSchema = z.string().uuid("Invalid group ID.");

export async function recordPayment(input: unknown): Promise<ApiResponse<Payment>> {
  try {
    await assertAuth();

    const parsed = recordPaymentSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const { id, group_id, from_member_id, to_member_id, amount_cents } = parsed.data;

    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("record_payment", {
      p_group_id: group_id,
      p_from_member_id: from_member_id,
      p_to_member_id: to_member_id,
      p_amount_cents: amount_cents,
      ...(id ? { p_id: id } : {}),
    });

    if (error) {
      logServerError("record_payment", error);
      return { data: null, error: "Failed to record payment." };
    }
    return parseRecordPaymentRpcResult(result);
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    logServerError("recordPayment", e);
    return { data: null, error: "Something went wrong." };
  }
}

export async function undoLastPayment(fromMemberId: string): Promise<ApiResponse<void>> {
  try {
    const parsed = memberIdSchema.safeParse(fromMemberId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid member ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("undo_last_payment_for_member", {
      p_from_member_id: parsed.data,
    });
    if (error) return { data: null, error: "Failed to undo payment." };
    const parsedResult = parseSuccessRpcResult(result);
    if (parsedResult.error) return { data: null, error: "Failed to undo payment." };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function undoMyLastPayment(groupId: string): Promise<ApiResponse<void>> {
  try {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid group ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { data: result, error } = await db.rpc("undo_last_payment", {
      p_group_id: parsed.data,
    });
    if (error) return { data: null, error: "No payment of yours found to undo." };
    const parsedResult = parseSuccessRpcResult(result);
    if (parsedResult.error) return { data: null, error: "Failed to undo payment." };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}
