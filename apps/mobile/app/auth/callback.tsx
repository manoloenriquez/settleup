import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import * as Linking from "expo-linking";
import { Link, useRouter } from "expo-router";
import { completeAuthLink, pendingAuthDestination } from "@/lib/auth-links";

export default function AuthCallbackScreen(): React.ReactElement {
  const url = Linking.useURL();
  const router = useRouter();
  const processed = useRef<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!url || processed.current === url) return;
    processed.current = url;
    void (async () => {
      const result = await completeAuthLink(url);
      if (result.error) setError(result.error);
      else
        router.replace(
          result.data?.recovery ? "/(auth)/update-password" : await pendingAuthDestination(),
        );
    })();
  }, [url, router]);
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 16 }}>
      <Text accessibilityRole={error ? "alert" : "text"}>
        {error || "Verifying your email link…"}
      </Text>
      {error ? (
        <>
          <Link href="/(auth)/forgot-password">Request a new recovery link</Link>
          <Link href="/(auth)/login">Return to sign in</Link>
        </>
      ) : null}
    </View>
  );
}
