"use server";

import { createClient } from "@/lib/supabase/server";
import { assertAuth } from "@/lib/supabase/guards";
import { QR_BUCKET, type ApiResponse } from "@template/shared";

/** Close this app's account while preserving shared ledgers and other apps' logins. */
export async function deleteAccount(): Promise<ApiResponse<null>> {
  try {
    const user = await assertAuth();
    const supabase = await createClient();
    // Closing removes the payment profile row directly; delete the public QR
    // images first so they don't outlive the account. Best effort.
    const { data: files } = await supabase.storage.from(QR_BUCKET).list(user.id, { limit: 1000 });
    if (files && files.length > 0) {
      await supabase.storage.from(QR_BUCKET).remove(files.map((file) => `${user.id}/${file.name}`));
    }
    const { error } = await supabase.schema("settleup").rpc("close_account");
    if (error) return { data: null, error: "Could not close your account. Please try again." };
    await supabase.auth.signOut({ scope: "local" });
    return { data: null, error: null };
  } catch {
    return { data: null, error: "Could not close your account. Please sign in and try again." };
  }
}
