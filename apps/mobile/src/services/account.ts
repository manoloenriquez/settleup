import { supabase } from "@/lib/supabase";
import { getApiBase } from "@/lib/api-base";
import type { ApiResponse } from "@template/shared";

/**
 * Permanently delete the authenticated user's account.
 * Calls apps/api DELETE /account, which uses the service role to remove
 * the auth.users row (cascading FKs handle profile + payment data).
 */
export async function deleteAccount(): Promise<ApiResponse<null>> {
  const apiBase = getApiBase();
  if (!apiBase) {
    return { data: null, error: "API URL not configured. Set EXPO_PUBLIC_API_URL." };
  }

  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData.session) {
    return { data: null, error: "Not signed in." };
  }

  try {
    const res = await fetch(`${apiBase}/account`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
    });

    const body = (await res.json().catch(() => null)) as { data: unknown; error: string | null } | null;

    if (!res.ok) {
      return { data: null, error: body?.error ?? `Delete failed (${res.status}).` };
    }

    return { data: null, error: null };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : "Network error while deleting account.",
    };
  }
}
