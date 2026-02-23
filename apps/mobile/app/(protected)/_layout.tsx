import { Stack } from "expo-router";

export default function ProtectedLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#fff" },
        headerTintColor: "#111827",
        headerTitleStyle: { fontWeight: "700", fontSize: 17 },
        headerShadowVisible: false,
        // Thin separator under the header
        headerBackgroundContainerStyle: {
          borderBottomWidth: 1,
          borderBottomColor: "#e5e7eb",
        },
      }}
    />
  );
}
