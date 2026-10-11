import { useCallback } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { ROUTES } from "@/lib/routes";

/**
 * What a guest sees when they reach something that needs an account: why,
 * and three choices. Never an error.
 */
export function useAccountPrompt(): (reason: string) => void {
  const router = useRouter();
  return useCallback(
    (reason: string) => {
      Alert.alert("Create a free account", reason, [
        { text: "Not Now", style: "cancel" },
        { text: "Sign In", onPress: () => router.push(ROUTES.login) },
        { text: "Create Account", style: "default", onPress: () => router.push(ROUTES.register) },
      ]);
    },
    [router],
  );
}

export const SHARE_REASON =
  "An account lets you split expenses with friends and groups, share balances and payment links, and sync across devices. Your personal expenses stay yours.";
