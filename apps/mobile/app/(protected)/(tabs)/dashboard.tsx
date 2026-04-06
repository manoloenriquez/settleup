import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useState } from "react";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useDashboardSummary } from "@/hooks/useDashboard";
import { useGroupsWithStats } from "@/hooks/useGroups";
import { formatCents, APP_NAME } from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { SkeletonCard } from "@/components/ui";

type QuickAction = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  color: string;
  bg: string;
  onPress: () => void;
};

export default function DashboardScreen() {
  const router = useRouter();
  const { data: summary, refetch: refetchSummary } = useDashboardSummary();
  const { data: groups, isLoading: loadingGroups, refetch: refetchGroups } = useGroupsWithStats();

  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([refetchSummary(), refetchGroups()]);
    setIsRefreshing(false);
  }

  const netCents = summary?.net_cents ?? 0;
  const isOwed = netCents > 0;
  const owes = netCents < 0;
  const settled = netCents === 0;

  const heroColor = owes ? colors.warning : isOwed ? colors.success : colors.primary;
  const heroBg = owes ? "#fef3c7" : isOwed ? "#d1fae5" : colors.primaryLight;
  const heroBorder = owes ? colors.warning + "60" : isOwed ? colors.success + "60" : colors.primary + "60";
  const heroLabel = isOwed ? "You are owed" : owes ? "You owe" : "All settled";
  const heroAmount = settled ? "₱0.00" : formatCents(Math.abs(netCents));

  const quickActions: QuickAction[] = [
    {
      icon: "add-circle-outline",
      label: "New Group",
      color: colors.primary,
      bg: colors.primaryLight,
      onPress: () => router.push("/(protected)/groups/new"),
    },
    {
      icon: "card-outline",
      label: "Payment",
      color: colors.success,
      bg: colors.successLight,
      onPress: () => router.push("/(protected)/account/payment"),
    },
    {
      icon: "people-outline",
      label: "All Groups",
      color: "#8b5cf6",
      bg: "#ede9fe",
      onPress: () => router.push("/(tabs)/groups/index"),
    },
  ];

  return (
    <>
      <Stack.Screen options={{ title: APP_NAME, headerShown: true }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {/* Hero Balance Card */}
        <View style={[styles.heroCard, { backgroundColor: heroBg, borderColor: heroBorder }]}>
          <View style={[styles.heroPill, { backgroundColor: heroColor + "20" }]}>
            <Ionicons
              name={owes ? "trending-down-outline" : isOwed ? "trending-up-outline" : "checkmark-circle-outline"}
              size={13}
              color={heroColor}
            />
            <Text style={[styles.heroPillText, { color: heroColor }]}>{heroLabel}</Text>
          </View>
          <Text style={[styles.heroAmount, { color: owes ? colors.gray900 : heroColor }]}>
            {heroAmount}
          </Text>
          {(summary?.total_groups ?? 0) > 0 && (
            <View style={styles.heroMeta}>
              <Ionicons name="people-outline" size={12} color={colors.gray400} />
              <Text style={styles.heroMetaText}>
                {summary?.total_groups ?? 0} group{(summary?.total_groups ?? 0) !== 1 ? "s" : ""}
              </Text>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={styles.quickBtn}
              onPress={action.onPress}
              activeOpacity={0.7}
            >
              <View style={[styles.quickBtnIcon, { backgroundColor: action.bg }]}>
                <Ionicons name={action.icon} size={20} color={action.color} />
              </View>
              <Text style={styles.quickBtnLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Groups Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>YOUR GROUPS</Text>
        </View>

        {loadingGroups ? (
          <View style={styles.skeletonWrapper}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : (groups ?? []).length === 0 ? (
          <View style={styles.emptyGroups}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="people-outline" size={32} color={colors.gray400} />
            </View>
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptySub}>Create a group to start tracking expenses</Text>
            <TouchableOpacity
              style={styles.emptyAction}
              onPress={() => router.push("/(protected)/groups/new")}
            >
              <Text style={styles.emptyActionText}>Create Group</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.groupsList}>
            {(groups ?? []).map((group) => {
              const hasDebt = (group.total_owed_cents ?? 0) > 0;
              return (
                <TouchableOpacity
                  key={group.id}
                  style={styles.groupCard}
                  onPress={() => router.push(`/(protected)/groups/${group.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.groupIcon}>
                    <Ionicons name="people" size={16} color={colors.primary} />
                  </View>
                  <View style={styles.groupCardBody}>
                    <View style={styles.groupCardTop}>
                      <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
                      {hasDebt ? (
                        <View style={styles.groupBadgeWarn}>
                          <Text style={styles.groupBadgeWarnText}>{formatCents(group.total_owed_cents ?? 0)}</Text>
                        </View>
                      ) : (
                        <View style={styles.groupBadgeOk}>
                          <Text style={styles.groupBadgeOkText}>Settled</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.groupMeta}>
                      {group.member_count ?? 0} member{(group.member_count ?? 0) !== 1 ? "s" : ""}
                      {(group.pending_count ?? 0) > 0 ? ` · ${group.pending_count} pending` : ""}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.gray300} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing["2xl"] },

  heroCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.base,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    marginBottom: spacing.sm,
  },
  heroPillText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.2 },
  heroAmount: { fontSize: fontSize["3xl"], fontWeight: fontWeight.bold, letterSpacing: -0.5, marginBottom: spacing.xs },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroMetaText: { fontSize: fontSize.xs, color: colors.gray400 },

  quickActions: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.base },
  quickBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  quickBtnIcon: { width: 40, height: 40, borderRadius: borderRadius.md, alignItems: "center", justifyContent: "center" },
  quickBtnLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.gray700, textAlign: "center" },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, letterSpacing: 0.8 },

  skeletonWrapper: { gap: spacing.sm },

  emptyGroups: { alignItems: "center", paddingVertical: spacing["2xl"] },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.gray100, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.gray800 },
  emptySub: { fontSize: fontSize.base, color: colors.gray400, marginTop: spacing.xs, textAlign: "center" },
  emptyAction: { marginTop: spacing.base, backgroundColor: colors.primaryLight, paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderRadius: borderRadius.full },
  emptyActionText: { color: colors.primary, fontWeight: fontWeight.semibold, fontSize: fontSize.base },

  groupsList: { gap: spacing.sm },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  groupIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  groupCardBody: { flex: 1, minWidth: 0 },
  groupCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginBottom: 2 },
  groupName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900, flex: 1 },
  groupMeta: { fontSize: fontSize.sm, color: colors.gray400 },
  groupBadgeWarn: { backgroundColor: "#fef3c7", borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, borderWidth: 1, borderColor: colors.warning + "60" },
  groupBadgeWarnText: { fontSize: fontSize.xs, color: "#92400e", fontWeight: fontWeight.semibold },
  groupBadgeOk: { backgroundColor: colors.successLight, borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, borderWidth: 1, borderColor: colors.success + "60" },
  groupBadgeOkText: { fontSize: fontSize.xs, color: "#065f46", fontWeight: fontWeight.semibold },
});
