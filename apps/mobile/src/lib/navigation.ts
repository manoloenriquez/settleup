import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import type { Href } from "expo-router";
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

type GroupRouter = { replace: (href: Href, options?: { withAnchor?: boolean }) => void };

/**
 * Open a group from a screen that sits outside the app's tabs (an invite or
 * friend link). A plain replace would leave the group with no back button and
 * no tab bar; with the anchor, the tabs are rendered underneath it.
 */
export function openGroupFromLink(router: GroupRouter, groupId: string): void {
  router.replace({ pathname: "/(protected)/groups/[id]", params: { id: groupId } }, { withAnchor: true });
}
