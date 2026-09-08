"use server";

import { createClient } from "@/lib/supabase/server";
import { assertAuth } from "@/lib/supabase/guards";
import type { ApiResponse } from "@template/shared";

/** Close this app's account while preserving shared ledgers and other apps' logins. */
export async function deleteAccount(): Promise<ApiResponse<null>> {
  try {
    await assertAuth();
    const supabase = await createClient();
    const { error } = await supabase.schema("settleup").rpc("close_account");
    if (error) return { data: null, error: "Could not close your account. Please try again." };
    await supabase.auth.signOut({ scope: "local" });
    return { data: null, error: null };
  } catch {
    return { data: null, error: "Could not close your account. Please sign in and try again." };
  }
}
