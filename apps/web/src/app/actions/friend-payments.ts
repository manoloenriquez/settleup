"use server";

import { headers } from "next/headers";
import { createAnonClient } from "@template/supabase";
import { createSettleUpDb } from "@/lib/supabase/settleup";
import { assertAuth, AuthError } from "@/lib/supabase/guards";
import { checkPublicRateLimit, getClientIp } from "@/lib/public-rate-limit";
import type { ApiResponse } from "@template/shared";
import { z } from "zod";

const submitSchema = z.object({
  share_token: z.string().min(8),
  to_member_id: z.string().uuid(),
  amount_cents: z.number().int().positive().max(100_000_000),
  note: z.string().trim().max(280).optional(),
});

const paymentIdSchema = z.string().uuid("Invalid payment ID.");
const groupIdSchema = z.string().uuid("Invalid group ID.");

export type PendingPayment = {
  id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount_cents: number;
  note: string | null;
  created_at: string;
};

/**
 * Anon-callable: a friend on their /p/{token} page reports they've paid.
 * Creates a PENDING payment that a group member must confirm before it
 * affects balances. Rate-limited per IP+token like the public pages.
 */
export async function submitFriendPayment(input: unknown): Promise<ApiResponse<{ payment_id: string }>> {
  try {
    const parsed = submitSchema.safeParse(input);
    if (!parsed.success) {
      return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const headersList = await headers();
    const clientIp = getClientIp(headersList);
    const allowed = checkPublicRateLimit(`friend-pay:${clientIp}:${parsed.data.share_token}`, {
      maxRequests: 5,
      windowMs: 5 * 60_000,
    });
    if (!allowed) return { data: null, error: "Too many attempts. Please try again in a few minutes." };

    const supabase = createAnonClient();
    const { data, error } = await supabase.schema("settleup").rpc("submit_friend_payment", {
      p_share_token: parsed.data.share_token,
      p_to_member_id: parsed.data.to_member_id,
      p_amount_cents: parsed.data.amount_cents,
      p_note: parsed.data.note ?? undefined,
    });

    if (error || !data) return { data: null, error: "Could not submit payment. Please try again." };
    const paymentId = (data as { payment_id?: string }).payment_id;
    if (!paymentId) return { data: null, error: "Could not submit payment. Please try again." };
    return { data: { payment_id: paymentId }, error: null };
  } catch {
    return { data: null, error: "Something went wrong." };
  }
}

export async function listPendingPayments(groupId: string): Promise<ApiResponse<PendingPayment[]>> {
  try {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid group ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const { data, error } = await supabase
      .schema("settleup")
      .from("payments")
      .select("id, group_id, from_member_id, to_member_id, amount_cents, note, created_at")
      .eq("group_id", parsed.data)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });

    if (error) return { data: null, error: "Failed to load pending payments." };
    return { data: (data ?? []) as PendingPayment[], error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

async function resolvePayment(paymentId: string, action: "confirm" | "reject"): Promise<ApiResponse<void>> {
  try {
    const parsed = paymentIdSchema.safeParse(paymentId);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid payment ID." };

    await assertAuth();
    const supabase = await createSettleUpDb();
    const db = supabase.schema("settleup");

    const { error } =
      action === "confirm"
        ? await db.rpc("confirm_payment", { p_payment_id: parsed.data })
        : await db.rpc("reject_payment", { p_payment_id: parsed.data });

    if (error) return { data: null, error: `Failed to ${action} payment.` };
    return { data: undefined, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { data: null, error: e.message };
    return { data: null, error: "Something went wrong." };
  }
}

export async function confirmPayment(paymentId: string): Promise<ApiResponse<void>> {
  return resolvePayment(paymentId, "confirm");
}

export async function rejectPayment(paymentId: string): Promise<ApiResponse<void>> {
  return resolvePayment(paymentId, "reject");
}
