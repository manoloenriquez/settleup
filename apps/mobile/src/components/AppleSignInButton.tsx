import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { appleSignInAvailable, signInWithApple } from "@/lib/apple-auth";
import { borderRadius } from "@/theme";

/** Apple's own button (required styling); renders nothing when unavailable. */
export function AppleSignInButton({
  mode,
  onError,
}: {
  mode: "signIn" | "signUp";
  onError: (message: string) => void;
}) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    void appleSignInAvailable().then(setAvailable);
  }, []);
  if (!available) return null;
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={
        mode === "signUp"
          ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
          : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
      }
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={borderRadius.md}
      style={styles.button}
      onPress={() => {
        void signInWithApple().then((result) => {
          if (result.error && result.error !== "Sign in cancelled") onError(result.error);
        });
      }}
    />
  );
}

const styles = StyleSheet.create({ button: { height: 50, width: "100%" } });
