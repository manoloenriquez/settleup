import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useDashboardSummary } from "@/hooks/useDashboard";
import { useGroupsWithStats } from "@/hooks/useGroups";
import { formatCents } from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { Badge } from "@/components/ui";
import { SkeletonCard } from "@/components/ui";

export default function DashboardScreen() {
  const router = useRouter();
  const { data: summary, isLoading: loadingSummary, refetch: refetchSummary } = useDashboardSummary();
  const { data: groups, isLoading: loadingGroups, refetch: refetchGroups } = useGroupsWithStats();

  const isRefreshing = false;

  function handleRefresh() {
    void refetchSummary();
    void refetchGroups();
  }

  const netCents = summary?.net_cents ?? 0;
  const netColor = netCents > 0 ? colors.success : netCents < 0 ? colors.danger : colors.primary;
  const netLabel = netCents > 0 ? "you are owed" : netCents < 0 ? "you owe" : "all settled";

  return (
    <>
      <Stack.Screen options={{ title: "SettleUp Lite", headerShown: true }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {/* Hero Balance Card */}
        <View style={[styles.heroCard, { backgroundColor: netColor }]}>
          <Text style={styles.heroLabel}>Net Balance</Text>
          <Text style={styles.heroAmount}>{formatCents(Math.abs(netCents))}</Text>
          <Text style={styles.heroSub}>{netLabel}</Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => router.push("/(protected)/groups/new")}
            activeOpacity={0.7}
          >
            <Text style={styles.quickBtnEmoji}>➕</Text>
            <Text style={styles.quickBtnLabel}>New Group</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => router.push("/(protected)/account/payment")}
            activeOpacity={0.7}
          >
            <Text style={styles.quickBtnEmoji}>💳</Text>
            <Text style={styles.quickBtnLabel}>Payment Info</Text>
          </TouchableOpacity>
        </View>

        {/* Groups Section */}
        <Text style={styles.sectionTitle}>YOUR GROUPS</Text>

        {loadingGroups ? (
          <View style={styles.skeletonWrapper}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : (groups ?? []).length === 0 ? (
          <View style={styles.emptyGroups}>
            <Text style={styles.emptyEmoji}>👥</Text>
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
            {(groups ?? []).map((group) => (
              <TouchableOpacity
                key={group.id}
                style={styles.groupCard}
                onPress={() => router.push(`/(protected)/groups/${group.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.groupCardTop}>
                  <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
                  {(group.pending_count ?? 0) > 0 && (
                    <Badge label={`${group.pending_count} pending`} variant="warning" />
                  )}
                </View>
                <View style={styles.groupCardBottom}>
                  <Text style={styles.groupMeta}>
                    {group.member_count ?? 0} members
                  </Text>
                  {(group.total_owed_cents ?? 0) > 0 && (
                    <Text style={[styles.groupOwed, { color: colors.danger }]}>
                      {formatCents(group.total_owed_cents ?? 0)} owed
                    </Text>
                  )}
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

  heroCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: "center",
    marginBottom: spacing.base,
  },
  heroLabel: { fontSize: fontSize.sm, color: "rgba(255,255,255,0.8)", fontWeight: fontWeight.medium, textTransform: "uppercase", letterSpacing: 0.5 },
  heroAmount: { fontSize: 40, fontWeight: fontWeight.bold, color: colors.white, marginVertical: spacing.xs },
  heroSub: { fontSize: fontSize.base, color: "rgba(255,255,255,0.9)", fontWeight: fontWeight.medium },

  quickActions: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.base },
  quickBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  quickBtnEmoji: { fontSize: 24 },
  quickBtnLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray700 },

  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.gray400, letterSpacing: 0.8, marginBottom: spacing.sm },

  skeletonWrapper: { gap: spacing.sm },

  emptyGroups: { alignItems: "center", paddingVertical: spacing["2xl"] },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
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
  },
  groupCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  groupName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.gray900, flex: 1, marginRight: spacing.sm },
  groupCardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  groupMeta: { fontSize: fontSize.sm, color: colors.gray400 },
  groupOwed: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
