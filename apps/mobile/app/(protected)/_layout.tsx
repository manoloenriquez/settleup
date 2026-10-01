import { Stack } from "expo-router";
import { stackScreenOptions } from "@/lib/navigation";

// Screens opened directly (invite links, notifications) keep the tabs underneath,
// so they always have a back button.
export const unstable_settings = { anchor: "(tabs)" };

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
