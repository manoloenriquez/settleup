import { StyleSheet, View, type ViewProps } from "react-native";
import { colors, borderRadius, spacing } from "@/theme";

type CardProps = ViewProps & { padding?: number };

export function Card({ style, padding = spacing.base, ...props }: CardProps) {
  return (
    <View
      style={[styles.card, { padding }, style]}
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
