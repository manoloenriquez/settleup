import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { colors } from "@/theme";

/**
 * The system tab bar (UITabBarController): native material, sizing, Dynamic
 * Type and VoiceOver behaviour. Each tab owns a stack so pushed screens keep
 * the tab bar, like Settings or Wallet.
 */
export default function TabsLayout() {
  return (
    <NativeTabs tintColor={colors.primary}>
      <NativeTabs.Trigger name="home">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="spending">
        <Icon sf={{ default: "list.bullet.rectangle", selected: "list.bullet.rectangle.fill" }} />
        <Label>Spending</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="shared">
        <Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
        <Label>Shared</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} />
        <Label>Account</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
