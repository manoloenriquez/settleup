import { StyleSheet, Text, View } from "react-native";
import { formatCents } from "@template/shared";
import type { ActivityItem } from "@/services/activity";
import { colors, fontSize, fontWeight, spacing } from "@/theme";
import { EmptyState } from "@/components/ui";

type ActivityTimelineProps = {
  items: ActivityItem[];
};

export function ActivityTimeline({ items }: ActivityTimelineProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="No activity yet"
        description="Activity will appear once you add expenses or record payments"
      />
    );
  }

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <View key={item.id} style={styles.row}>
          <View style={styles.iconWrapper}>
            <Text style={styles.icon}>{item.type === "expense" ? "🧾" : "✅"}</Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.label} numberOfLines={1}>{item.label}</Text>
            <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString("en-PH")}</Text>
          </View>
          <Text style={[styles.amount, item.type === "payment" && { color: colors.success }]}>
            {formatCents(item.amount_cents)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrapper: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.gray100, alignItems: "center", justifyContent: "center" },
  icon: { fontSize: 16 },
  info: { flex: 1 },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray900 },
  date: { fontSize: fontSize.xs, color: colors.gray400, marginTop: 2 },
  amount: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray900 },
});
