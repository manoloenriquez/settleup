import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type ErrorBannerProps = {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
};

export function ErrorBanner({ message, onRetry, onDismiss }: ErrorBannerProps): React.ReactElement {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={20} color={colors.danger} style={styles.icon} />
      <Text style={styles.message} numberOfLines={3}>
        {message}
      </Text>
      {onRetry && (
        <TouchableOpacity style={styles.action} onPress={onRetry} accessibilityLabel="Retry">
          <Text style={styles.actionText}>Retry</Text>
        </TouchableOpacity>
      )}
      {onDismiss && (
        <TouchableOpacity onPress={onDismiss} accessibilityLabel="Dismiss" style={styles.dismiss}>
          <Ionicons name="close" size={18} color={colors.danger} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.dangerLight,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  icon: {},
  message: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.danger,
    fontWeight: fontWeight.medium,
  },
  action: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.white,
  },
  actionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.danger,
  },
  dismiss: {
    padding: spacing.xs,
  },
});
