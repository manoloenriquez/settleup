import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Slide animation feels natural for auth flows
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "#f8fafc" },
      }}
    />
  );
}
