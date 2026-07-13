import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useState } from "react";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRecentActivity } from "@/hooks/useActivity";
import { formatCents } from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { SkeletonCard, ErrorBanner } from "@/components/ui";
import type { RecentActivityItem } from "@/services/activity";

function relativeTime(dateStr: string): string {
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function amountColor(direction: RecentActivityItem["direction"]): string {
  if (direction === "in") return colors.success;
  if (direction === "out") return colors.danger;
  return colors.gray700;
}

function amountText(item: RecentActivityItem): string {
  const amount = formatCents(item.amount_cents);
  if (item.direction === "in") return `+${amount}`;
  if (item.direction === "out") return `-${amount}`;
  return amount;
}

export default function ActivityScreen() {
  const router = useRouter();
  const { data: items, isLoading, error, refetch } = useRecentActivity(50);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRefresh() {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }

  return (
    <>
      <Stack.Screen options={{ title: "Activity", headerShown: true }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {error && (
          <ErrorBanner
            message={error instanceof Error ? error.message : "Couldn't load activity."}
            onRetry={() => void refetch()}
          />
        )}

        {isLoading ? (
          <View style={styles.skeletonWrapper}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : (items ?? []).length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="pulse-outline" size={32} color={colors.gray400} />
            </View>
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptySub}>Expenses and payments across your groups will show up here</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {(items ?? []).map((item, index) => (
              <TouchableOpacity
                key={`${item.type}-${item.id}`}
                style={[styles.row, index > 0 && styles.rowBorder]}
                onPress={() => router.push(`/(protected)/groups/${item.group_id}`)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.iconTile,
                    {
                      backgroundColor:
                        item.type === "payment"
                          ? colors.successLight
                          : (item.category?.color ?? colors.gray500) + "1a",
                    },
                  ]}
                >
                  <Ionicons
                    name={item.type === "payment" ? "cash-outline" : "receipt-outline"}
                    size={18}
                    color={item.type === "payment" ? colors.success : item.category?.color ?? colors.gray500}
                  />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.subtitle}
                    {item.type === "expense" && item.group_name !== item.title ? ` · ${item.group_name}` : ""}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowAmount, { color: amountColor(item.direction) }]}>
                    {amountText(item)}
                  </Text>
                  <Text style={styles.rowTime}>{relativeTime(item.created_at)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing["2xl"] },
  skeletonWrapper: { gap: spacing.sm },

  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.gray100 },
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900 },
  rowSub: { fontSize: fontSize.sm, color: colors.gray500, marginTop: 1 },
  rowRight: { alignItems: "flex-end", flexShrink: 0 },
  rowAmount: { fontSize: fontSize.md, fontWeight: fontWeight.bold, fontVariant: ["tabular-nums"] },
  rowTime: { fontSize: fontSize.xs, color: colors.gray400, marginTop: 1 },

  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.gray100, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.gray800 },
  emptySub: { fontSize: fontSize.base, color: colors.gray400, marginTop: spacing.xs, textAlign: "center", paddingHorizontal: spacing.xl },
});
