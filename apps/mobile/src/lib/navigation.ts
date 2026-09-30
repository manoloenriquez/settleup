import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { colors } from "@/theme";

/**
 * Shared native-stack look. Colours and fonts are left to UIKit so the bar
 * gets the system material, Dynamic Type and large-title behaviour; only the
 * tint (back button, bar buttons) carries the brand colour.
 */
export const stackScreenOptions: NativeStackNavigationOptions = {
  headerTintColor: colors.primary,
  headerTitleStyle: { color: colors.gray900 },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: "minimal",
  contentStyle: { backgroundColor: colors.background },
};

/** Root screens of each tab use the iOS large title. */
export const largeTitleOptions: NativeStackNavigationOptions = {
  headerLargeTitle: true,
  headerLargeTitleShadowVisible: false,
};
