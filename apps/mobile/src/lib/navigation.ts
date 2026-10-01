import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { useColorScheme } from "react-native";
import type { Href } from "expo-router";
import { brand, colors } from "@/theme";

/**
 * Shared native-stack look. Colours and fonts are left to UIKit so the bar
 * gets the system material, Dynamic Type and large-title behaviour; only the
 * tint (back button, bar buttons) carries the brand colour.
 */
export const stackScreenOptions: NativeStackNavigationOptions = {
  headerTintColor: brand.primary,
  headerShadowVisible: false,
  headerBackButtonDisplayMode: "minimal",
  contentStyle: { backgroundColor: colors.background },
};

/**
 * Stack options with title colors for the current appearance. Without an
 * explicit title color iOS draws titles in the tint (brand green); header
 * options take plain strings, so the color is picked here per appearance.
 */
export function useStackScreenOptions(): NativeStackNavigationOptions {
  const dark = useColorScheme() === "dark";
  const title = dark ? "#f5f5f7" : "#111827";
  return {
    ...stackScreenOptions,
    headerTitleStyle: { color: title },
    headerLargeTitleStyle: { color: title },
  };
}

/** Root screens of each tab use the iOS large title. */
export const largeTitleOptions: NativeStackNavigationOptions = {
  headerLargeTitle: true,
  headerLargeTitleShadowVisible: false,
};

type GroupRouter = { dismissTo: (href: Href) => void };

/**
 * Open a group from a screen that sits outside the app's tabs (an invite or
 * friend link). Replacing that screen with the group directly leaves it with
 * no back button, and replace-then-push in one go doesn't stack either, so
 * open the Shared tab with the group to show: Shared pushes it once mounted,
 * and back returns to Shared, where the group or friend is listed. dismissTo
 * returns to the tabs already underneath (no second copy of them) and falls
 * back to a replace when the app was opened by the link.
 */
export function openGroupFromLink(router: GroupRouter, groupId: string): void {
  router.dismissTo({ pathname: "/(protected)/(tabs)/shared", params: { open: groupId } });
}
