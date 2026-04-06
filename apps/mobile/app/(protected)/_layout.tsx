import { Stack } from "expo-router";
import { colors, fontWeight, fontSize } from "@/theme";

export default function ProtectedLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.gray900,
        headerTitleStyle: { fontWeight: fontWeight.bold, fontSize: fontSize.lg },
        headerShadowVisible: false,
      }}
    />
  );
}
