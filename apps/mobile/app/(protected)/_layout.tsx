import { Stack } from "expo-router";
import { stackScreenOptions } from "@/lib/navigation";

export default function ProtectedLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "" }} />
      {/* Personal expense forms are native page sheets: swipe down to cancel. */}
      <Stack.Screen name="expense/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="expense/[id]" options={{ presentation: "modal" }} />
      <Stack.Screen name="activity" options={{ title: "Activity" }} />
    </Stack>
  );
}
