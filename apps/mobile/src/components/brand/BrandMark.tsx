import { StyleSheet, View, type ViewStyle } from "react-native";
import { colors } from "@/theme";

type BrandMarkProps = { size?: number; style?: ViewStyle };

export function BrandMark({ size = 36, style }: BrandMarkProps): React.ReactElement {
  const inset = Math.round(size * 0.18);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.mark, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <View style={[styles.left, { top: inset, bottom: inset, left: inset, width: Math.round(size * 0.29) }]} />
      <View style={[styles.right, { top: inset, bottom: inset, right: inset, width: Math.round(size * 0.29), borderWidth: Math.max(2, Math.round(size * 0.06)) }]} />
      <View style={[styles.divider, { left: size / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { position: "relative", overflow: "hidden", backgroundColor: colors.primary },
  left: { position: "absolute", borderTopLeftRadius: 999, borderBottomLeftRadius: 999, backgroundColor: colors.white },
  right: { position: "absolute", borderTopRightRadius: 999, borderBottomRightRadius: 999, borderColor: colors.white },
  divider: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,0.38)" },
});
