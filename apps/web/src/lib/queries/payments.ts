import { supabase } from "@/lib/supabase/client";
import type { ApiResponse } from "@template/shared";
import type { PendingPayment } from "@/app/actions/friend-payments";

export async function listPendingPayments(groupId: string): Promise<ApiResponse<PendingPayment[]>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("payments")
    .select("id, group_id, from_member_id, to_member_id, amount_cents, note, created_at")
    .eq("group_id", groupId)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: "Failed to load pending payments." };
  return { data: (data ?? []) as PendingPayment[], error: null };
}
