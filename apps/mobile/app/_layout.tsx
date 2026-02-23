import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/context/AuthContext";

// ---------------------------------------------------------------------------
// RouteGuard
// Watches session + loading state and performs segment-based redirects.
// Must be rendered inside <AuthProvider>.
// ---------------------------------------------------------------------------

function RouteGuard() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // Wait until auth is initialised

    const inAuthGroup = segments[0] === "(auth)";
    const inProtectedGroup = segments[0] === "(protected)";

    if (!session && !inAuthGroup) {
      // Not signed in — push to login
      router.replace("/(auth)/login");
    } else if (session && !inProtectedGroup) {
      // Signed in — push to home
      router.replace("/(protected)/home");
    }
  }, [session, loading, segments, router]);

  return null;
}

// ---------------------------------------------------------------------------
// Root stack navigator
// ---------------------------------------------------------------------------

function RootStack() {
  const { loading } = useAuth();

  // Show a full-screen spinner while the session is being restored from SecureStore.
  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* index is the initial route — only shown for a frame before redirect */}
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(protected)" />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Root layout — exported default
// ---------------------------------------------------------------------------

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <RouteGuard />
      <RootStack />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});
