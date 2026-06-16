"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@template/shared";

/**
 * Permanently delete the authenticated user's account.
 *
 * Posts to the apps/api DELETE /account endpoint with the user's Supabase
 * session token. The API service uses its service role key to remove the
 * auth.users row (cascading FKs handle profile + payment data).
 *
 * Returns ApiResponse<null>; on success, redirects to /login.
 */
export async function deleteAccount(): Promise<ApiResponse<null>> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { data: null, error: "Not signed in." };
  }

  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    return { data: null, error: "Server is not configured for account deletion." };
  }

  let res: Response;
  try {
    res = await fetch(`${apiUrl.replace(/\/$/, "")}/account`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : "Could not reach the server.",
    };
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { data: null, error: body?.error ?? `Delete failed (${res.status}).` };
  }

  await supabase.auth.signOut();
  redirect("/login");
}
