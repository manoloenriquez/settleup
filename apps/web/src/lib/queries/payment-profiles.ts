import { supabase } from "@/lib/supabase/client";
import type { ApiResponse } from "@template/shared";
import type { UserPaymentProfile } from "@template/supabase";

/** The signed-in user's own payment profile (GCash/bank details), or null. */
export async function getPaymentProfile(): Promise<ApiResponse<UserPaymentProfile | null>> {
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) return { data: null, error: "Not signed in." };

  const { data, error } = await supabase
    .schema("settleup")
    .from("user_payment_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { data: null, error: "Failed to load payment profile." };
  return { data: data ?? null, error: null };
}
