import { StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";
import { colors, borderRadius, spacing } from "@/theme";

type CardVariant = "default" | "interactive" | "metric" | "status" | "flat";
type CardProps = ViewProps & { padding?: number; variant?: CardVariant };

export function Card({ style, padding = spacing.base, variant = "default", ...props }: CardProps): React.ReactElement {
  return (
    <View
      style={[styles.card, variantStyles[variant], { padding }, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
});

const variantStyles: Record<CardVariant, ViewStyle> = {
  default: {},
  interactive: { shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  metric: { backgroundColor: colors.primaryLight, borderColor: colors.primary + "28" },
  status: { borderLeftWidth: 4, borderLeftColor: colors.primary },
  flat: { shadowOpacity: 0, elevation: 0 },
};
