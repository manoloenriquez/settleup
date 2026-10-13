"use server";

import { createClient } from "@/lib/supabase/server";
import { assertAuth } from "@/lib/supabase/guards";
import { QR_BUCKET, type ApiResponse } from "@template/shared";

/** Close this app's account while preserving shared ledgers and other apps' logins. */
export async function deleteAccount(): Promise<ApiResponse<null>> {
  try {
    const user = await assertAuth();
    const supabase = await createClient();
    // Closing removes the payment profile row; its public QR images must not
    // outlive the account. Remove them only after closure succeeds (a failed
    // closure keeps the profile intact) and before signing out. Best effort.
    const { data: files } = await supabase.storage.from(QR_BUCKET).list(user.id, { limit: 1000 });
    const { error } = await supabase.schema("settleup").rpc("close_account");
    if (error) return { data: null, error: "Could not close your account. Please try again." };
    if (files && files.length > 0) {
      await supabase.storage.from(QR_BUCKET).remove(files.map((file) => `${user.id}/${file.name}`));
    }
    await supabase.auth.signOut({ scope: "local" });
    return { data: null, error: null };
  } catch {
    return { data: null, error: "Could not close your account. Please sign in and try again." };
  }
}
