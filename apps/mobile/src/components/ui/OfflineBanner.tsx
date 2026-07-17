import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useIsOnline } from "@/lib/network";
import { colors, fontSize, fontWeight, spacing } from "@/theme";

type OfflineBannerProps = {
  /** Queued offline changes waiting to sync (from the outbox). */
  pendingCount?: number;
  /** Opens the pending-changes sheet when the banner is tapped. */
  onPress?: () => void;
};

/**
 * Global connectivity strip under the status bar. Hidden while online with
 * nothing queued; shows "offline, showing saved data" and, once offline
 * writes exist, the pending count.
 */
export function OfflineBanner({ pendingCount = 0, onPress }: OfflineBannerProps): React.ReactElement | null {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();

  if (online && pendingCount === 0) return null;

  const message = online
    ? `Syncing ${pendingCount} pending ${pendingCount === 1 ? "change" : "changes"}…`
    : pendingCount > 0
      ? `You're offline — ${pendingCount} ${pendingCount === 1 ? "change" : "changes"} will sync later`
      : "You're offline — showing saved data";

  const content = (
    // Rendered above the navigation stack: extend behind the OS status bar.
    <View style={[styles.container, { paddingTop: insets.top + spacing.xs }]}>
      <Ionicons
        name={online ? "sync" : "cloud-offline-outline"}
        size={14}
        color={colors.warningDark}
      />
      <Text style={styles.text}>{message}</Text>
      {onPress && <Ionicons name="chevron-forward" size={14} color={colors.warningDark} />}
    </View>
  );

  if (!onPress) return content;
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={message}>
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.warningLight,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  text: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.warningDark,
  },
});
