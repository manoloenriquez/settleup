import { Stack, useRouter } from "expo-router";
import { Text, TouchableOpacity } from "react-native";
import { usePreferences } from "@/context/PreferencesContext";
import { ROUTES } from "@/lib/routes";
import { colors, fontSize } from "@/theme";

/** Signing in is optional: once onboarded, every auth screen can be left with "Not Now". */
export default function AuthLayout() {
  const router = useRouter();
  const { onboarded } = usePreferences();
  return (
    <Stack
      screenOptions={{
        headerShown: onboarded,
        headerTransparent: true,
        headerTitle: "",
        headerShadowVisible: false,
        headerBackVisible: false,
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => router.replace(ROUTES.home)}
            accessibilityRole="button"
            hitSlop={12}
          >
            <Text style={{ color: colors.primary, fontSize: fontSize.md }}>Not Now</Text>
          </TouchableOpacity>
        ),
        animation: "slide_from_right",
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="update-password" options={{ headerShown: false }} />
    </Stack>
  );
}
