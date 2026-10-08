import { StyleSheet, Text, View, type ColorValue } from "react-native";
import { colors, borderRadius, fontSize, fontWeight, spacing } from "@/theme";

type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "primary";

type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
};

const VARIANT_STYLES: Record<BadgeVariant, { bg: ColorValue; text: ColorValue }> = {
  // Dark text on the light tints keeps every badge above 4.5:1.
  success: { bg: colors.successLight, text: colors.successDark },
  warning: { bg: colors.warningLight, text: colors.warningDark },
  danger: { bg: colors.dangerLight, text: colors.danger },
  neutral: { bg: colors.gray100, text: colors.gray600 },
  primary: { bg: colors.primaryLight, text: colors.primaryDark },
};

export function Badge({ label, variant = "neutral" }: BadgeProps) {
  const v = VARIANT_STYLES[variant];
  return (
    <View style={[styles.badge, { backgroundColor: v.bg }]}>
      <Text style={[styles.text, { color: v.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.3,
  },
});
