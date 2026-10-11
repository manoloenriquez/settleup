import { getApiBase } from "@/lib/api-base";
import type { ApiResponse } from "@template/shared";

/**
 * Close the authenticated user's account in this app.
 * Calls apps/api DELETE /account with the user JWT; the API responds with
 * `{ data: { closed: true } }`. Shared ledgers and the Auth login used by
 * other applications are preserved.
 */
export async function deleteAccount(accessToken: string): Promise<ApiResponse<null>> {
  const apiBase = getApiBase();
  if (!apiBase) {
    return { data: null, error: "API URL not configured. Set EXPO_PUBLIC_API_URL." };
  }

  if (!accessToken) {
    return { data: null, error: "Not signed in." };
  }

  try {
    const res = await fetch(`${apiBase}/account`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const body = (await res.json().catch(() => null)) as {
      data: unknown;
      error: string | null;
    } | null;

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
