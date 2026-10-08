import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@template/shared";

/**
 * Sign in with Apple is shown only when the Apple provider is configured in
 * Supabase (Auth › Providers › Apple, with this app's bundle id as an
 * authorized client id) and the build opts in, so a half-configured project
 * never shows a button that cannot work.
 */
export function appleSignInConfigured(): boolean {
  return Platform.OS === "ios" && process.env.EXPO_PUBLIC_APPLE_SIGN_IN === "true";
}

export async function appleSignInAvailable(): Promise<boolean> {
  if (!appleSignInConfigured()) return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<ApiResponse<void>> {
  try {
    // Apple receives only the hash; Supabase verifies the raw nonce against it.
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) {
      return { data: null, error: "Apple didn’t return a sign-in token. Try again." };
    }
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) return { data: null, error: "Sign in with Apple couldn’t finish. Try again or use email." };
    // Apple shares the name only on the first sign-in; keep it for the profile.
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ");
    if (fullName) await supabase.auth.updateUser({ data: { full_name: fullName } });
    return { data: undefined, error: null };
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === "ERR_REQUEST_CANCELED") return { data: null, error: "Sign in cancelled" };
    return { data: null, error: "Sign in with Apple couldn’t finish. Check your connection and try again." };
  }
}
