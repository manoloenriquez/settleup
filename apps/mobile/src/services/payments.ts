import { supabase } from "@/lib/supabase";
import { recordPaymentSchema } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import {
  parseRecordPaymentRpcResult,
  parseSuccessRpcResult,
  type Payment,
} from "@template/supabase";

export async function recordPayment(params: {
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}): Promise<ApiResponse<Payment>> {
  const parsed = recordPaymentSchema.safeParse({
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
