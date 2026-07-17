import { supabase } from "@/lib/supabase";
import { recordPaymentSchema } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import {
  parseRecordPaymentRpcResult,
  parseSuccessRpcResult,
  type Payment,
} from "@template/supabase";

export async function recordPayment(params: {
  /** Client-generated UUID: idempotency key for offline/flaky-network replays. */
  clientId?: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}): Promise<ApiResponse<Payment>> {
  const parsed = recordPaymentSchema.safeParse({
    id: params.clientId,
    group_id: params.groupId,
    from_member_id: params.fromMemberId,
    to_member_id: params.toMemberId,
    amount_cents: params.amountCents,
  });
  if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { data, error } = await supabase
    .schema("settleup")
    .rpc("record_payment", {
      p_group_id: params.groupId,
      p_from_member_id: params.fromMemberId,
      p_to_member_id: params.toMemberId,
      p_amount_cents: params.amountCents,
      ...(params.clientId ? { p_id: params.clientId } : {}),
    })

  if (error || !data) return { data: null, error: error?.message ?? "Failed to record payment" };
  return parseRecordPaymentRpcResult(data);
}

export async function undoLastPayment(groupId: string): Promise<ApiResponse<null>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("undo_last_payment", { p_group_id: groupId });

  if (error || !data) return { data: null, error: error?.message ?? "No payment found" };
  const parsed = parseSuccessRpcResult(data);
  if (parsed.error) return { data: null, error: parsed.error };
  return { data: null, error: null };
}

export type PendingPayment = {
  id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount_cents: number;
  note: string | null;
  created_at: string;
};

export async function listPendingPayments(groupId: string): Promise<ApiResponse<PendingPayment[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("payments")
    .select("id, group_id, from_member_id, to_member_id, amount_cents, note, created_at")
    .eq("group_id", groupId)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as PendingPayment[], error: null };
}

export async function resolvePendingPayment(
  paymentId: string,
  action: "confirm" | "reject",
): Promise<ApiResponse<null>> {
  const { data, error } =
    action === "confirm"
      ? await supabase.schema("settleup").rpc("confirm_payment", { p_payment_id: paymentId })
      : await supabase.schema("settleup").rpc("reject_payment", { p_payment_id: paymentId });

  if (error || !data) return { data: null, error: error?.message ?? `Failed to ${action} payment` };
  return { data: null, error: null };
}

export async function undoLastPaymentForMember(memberId: string): Promise<ApiResponse<null>> {
  const { data, error } = await supabase
    .schema("settleup")
    .rpc("undo_last_payment_for_member", { p_from_member_id: memberId });

  if (error || !data) return { data: null, error: error?.message ?? "No payment found" };
  const parsed = parseSuccessRpcResult(data);
  if (parsed.error) return { data: null, error: parsed.error };
  return { data: null, error: null };
}
