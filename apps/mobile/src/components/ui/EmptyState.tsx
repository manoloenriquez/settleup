import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

type EmptyStateProps = {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon && <Text style={styles.icon}>{icon}</Text>}
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.action} onPress={onAction}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", paddingVertical: spacing["3xl"], paddingHorizontal: spacing.xl },
  icon: { fontSize: 48, marginBottom: spacing.base },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.gray800, textAlign: "center" },
  description: { fontSize: fontSize.md, color: colors.gray400, textAlign: "center", marginTop: spacing.sm, lineHeight: 22 },
  action: { marginTop: spacing.base, backgroundColor: colors.primaryLight, paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderRadius: 999 },
  actionText: { color: colors.primary, fontWeight: fontWeight.semibold, fontSize: fontSize.base },
});
