import { supabase } from "@/lib/supabase";
import { recordPaymentSchema } from "@template/shared";
import type { ApiResponse } from "@template/shared";

type Payment = {
  id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount_cents: number;
  created_at: string;
};

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
    .from("payments")
    .insert({
      group_id: params.groupId,
      from_member_id: params.fromMemberId,
      to_member_id: params.toMemberId,
      amount_cents: params.amountCents,
    })
    .select()
    .single();

  if (error || !data) return { data: null, error: error?.message ?? "Failed to record payment" };
  return { data: data as Payment, error: null };
}

export async function undoLastPayment(groupId: string): Promise<ApiResponse<null>> {
  // Fetch last payment for this group
  const { data: last, error: fetchErr } = await supabase
    .schema("settleup")
    .from("payments")
    .select("id")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (fetchErr || !last) return { data: null, error: "No payment found" };

  const { error } = await supabase
    .schema("settleup")
    .from("payments")
    .delete()
    .eq("id", last.id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}
