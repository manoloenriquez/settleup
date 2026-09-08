import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Href } from "expo-router";
import { makeRedirectUri } from "expo-auth-session";
import { safeReturnPath, type ApiResponse } from "@template/shared";
import { supabase } from "@/lib/supabase";

const RETURN_KEY = "tabkind:auth-return:v1";

export function authCallbackUrl(recovery = false): string {
  return (
    makeRedirectUri({ scheme: "tabkind", path: "auth/callback" }) +
    (recovery ? "?next=/update-password" : "")
  );
}

export async function saveAuthDestination(path: string): Promise<void> {
  await AsyncStorage.setItem(RETURN_KEY, safeReturnPath(path));
}

export async function clearAuthDestination(): Promise<void> {
  await AsyncStorage.removeItem(RETURN_KEY);
}

export async function pendingAuthDestination(): Promise<Href> {
  const path = safeReturnPath(await AsyncStorage.getItem(RETURN_KEY));
  const url = new URL(path, "https://app.invalid");
  if (url.pathname === "/claim")
    return { pathname: "/claim", params: { token: url.searchParams.get("token") ?? "" } };
  if (url.pathname === "/join")
    return { pathname: "/join", params: { code: url.searchParams.get("code") ?? "" } };
  const groupId = /^\/groups\/([0-9a-f-]{36})$/.exec(url.pathname)?.[1];
  if (groupId) return { pathname: "/(protected)/groups/[id]", params: { id: groupId } };
  return "/(protected)/(tabs)/dashboard";
}

/** Accept only a callback opened by the OS or the OAuth auth-session browser. */
export async function completeAuthLink(url: string): Promise<ApiResponse<{ recovery: boolean }>> {
  try {
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.hash.slice(1));
    if (parsed.searchParams.has("error") || params.has("error"))
      return {
        data: null,
        error: "This link has expired or has already been used. Request a new email.",
      };
    const code = parsed.searchParams.get("code");
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const recovery =
      params.get("type") === "recovery" || parsed.searchParams.get("next") === "/update-password";
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error)
        return {
          data: null,
          error:
            "This link could not be verified. Open the newest email on the device where you requested it.",
        };
    } else if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error)
        return { data: null, error: "This link could not be verified. Request a new email." };
    } else
      return { data: null, error: "The authentication link is incomplete. Request a new email." };
    return { data: { recovery }, error: null };
  } catch {
    return { data: null, error: "Could not verify the link. Check your connection and try again." };
  }
}
