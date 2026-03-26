import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

export async function signInWithGoogle(): Promise<ApiResponse<void>> {
  const redirectUri = makeRedirectUri({ scheme: "settleup" });
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUri)}`;

  const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);

  if (result.type !== "success") {
    return { data: null, error: "Sign in cancelled" };
  }

  // Parse fragment: #access_token=...&refresh_token=...
  const fragment = result.url.split("#")[1] ?? "";
  const params = new URLSearchParams(fragment);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");

  if (!access_token || !refresh_token) {
    return { data: null, error: "Missing tokens" };
  }

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) return { data: null, error: error.message };

  return { data: undefined, error: null };
}
