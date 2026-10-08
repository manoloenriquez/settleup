import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase";
import { authCallbackUrl, completeAuthLink } from "@/lib/auth-links";
import type { ApiResponse } from "@template/shared";

export async function signInWithGoogle(): Promise<ApiResponse<void>> {
  try {
    const redirectTo = authCallbackUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url)
      return { data: null, error: "Google sign-in is unavailable. Try again." };
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return { data: null, error: "Sign in cancelled" };
    const completed = await completeAuthLink(result.url);
    return completed.error
      ? { data: null, error: completed.error }
      : { data: undefined, error: null };
  } catch {
    return {
      data: null,
      error: "Google sign-in could not finish. Check your connection and try again.",
    };
  }
}
