import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useDashboardSummary } from "@/hooks/useDashboard";
import { formatCents } from "@template/shared";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { SkeletonCard, ErrorBanner } from "@/components/ui";
import { ROUTES } from "@/lib/routes";

/**
 * Balances with other people (signed-in users only): net position, who owes
 * whom, and each group. Group amounts are pesos until groups carry their own
 * currency (audit phase 5).
 */
export function SharedBalances() {
  const router = useRouter();
  const { data: summary, isLoading: loadingSummary, refetch: refetchSummary, error: summaryError } = useDashboardSummary();

  const groups = summary?.groups ?? [];
  const netCents = summary?.net_balance_cents ?? 0;
  const isOwed = netCents > 0;
  const owes = netCents < 0;
  const owedCount = summary?.owed_counterparty_count ?? 0;
  const oweCount = summary?.owe_counterparty_count ?? 0;

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Shared with others
        </Text>
        <TouchableOpacity onPress={() => router.push(ROUTES.shared)} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.sectionLink}>All Groups</Text>
        </TouchableOpacity>
      </View>
        {summaryError && (
          <ErrorBanner
            message={summaryError instanceof Error ? summaryError.message : "Couldn't load your dashboard."}
            onRetry={() => void refetchSummary()}
          />
        )}

        {/* Total balance */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Your balance with others</Text>
          <Text
            style={[
              styles.heroAmount,
              { color: isOwed ? colors.primaryDark : owes ? colors.danger : colors.gray900 },
            ]}
          >
            {isOwed ? "+" : ""}
            {netCents === 0 ? "All clear" : formatCents(netCents)}
          </Text>
          <Text style={styles.heroSub}>
            {owes ? "You owe more than you’re owed" : isOwed ? "Others owe you" : "Nobody owes anybody"}
          </Text>
        </View>

        {/* Owed / owe split */}
        <View style={styles.splitRow}>
          <View style={[styles.splitCard, styles.splitCardOwed]}>
            <View style={[styles.splitIcon, { backgroundColor: colors.success }]}>
              <Ionicons name="arrow-down-outline" size={14} color={colors.white} />
            </View>
            <Text style={[styles.splitLabel, { color: colors.successDark }]}>You are owed</Text>
            <Text style={[styles.splitAmount, { color: colors.successDark }]} numberOfLines={1}>
              {formatCents(summary?.owed_to_me_cents ?? 0)}
            </Text>
            <Text style={[styles.splitMeta, { color: colors.success }]}>
              from {owedCount} {owedCount === 1 ? "person" : "people"}
            </Text>
          </View>
          <View style={[styles.splitCard, styles.splitCardOwe]}>
            <View style={[styles.splitIcon, { backgroundColor: colors.danger }]}>
              <Ionicons name="arrow-up-outline" size={14} color={colors.white} />
            </View>
            <Text style={[styles.splitLabel, { color: colors.danger }]}>You owe</Text>
            <Text style={[styles.splitAmount, { color: colors.danger }]} numberOfLines={1}>
              {formatCents(summary?.i_owe_cents ?? 0)}
            </Text>
            <Text style={[styles.splitMeta, { color: colors.danger }]}>
              to {oweCount} {oweCount === 1 ? "person" : "people"}
            </Text>
          </View>
        </View>

        {/* Groups */}

        {loadingSummary ? (
          <View style={styles.skeletonWrapper}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : groups.length === 0 ? (
          <View style={styles.emptyGroups}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="people-outline" size={32} color={colors.gray400} />
            </View>
            <Text style={styles.emptyTitle}>No shared expenses yet</Text>
            <Text style={styles.emptySub}>Create a group for a trip, a household or a night out.</Text>
            <TouchableOpacity
              style={styles.emptyAction}
              onPress={() => router.push("/(protected)/groups/new")}
            >
              <Text style={styles.emptyActionText}>Create Group</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.groupsRow}
          >
            {groups.map((group) => {
              const myNet = group.my_net_cents ?? 0;
              return (
                <TouchableOpacity
                  key={group.id}
                  style={styles.groupCard}
                  onPress={() => router.push(`/(protected)/groups/${group.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.groupIcon}>
                    <Text style={styles.groupIconText}>
                      {group.name.trim()[0]?.toUpperCase() ?? "G"}
                    </Text>
                  </View>
                  <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
                  {myNet > 0 ? (
                    <Text style={styles.groupNetOwed} numberOfLines={1}>
                      You’re owed {formatCents(myNet)}
                    </Text>
                  ) : myNet < 0 ? (
                    <Text style={styles.groupNetOwe} numberOfLines={1}>
                      You owe {formatCents(-myNet)}
                    </Text>
                  ) : (
                    <Text style={styles.groupNetSettled}>Settled up</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  greetingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.base },
  greetingLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  greetingSub: { fontSize: fontSize.xs, color: colors.gray500 },
  greetingName: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.gray900 },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroLabel: { fontSize: fontSize.base, color: colors.gray500, fontWeight: fontWeight.medium },
  heroAmount: { fontSize: 34, fontWeight: fontWeight.bold, letterSpacing: -0.5, marginTop: 4, fontVariant: ["tabular-nums"] },
  heroSub: { fontSize: fontSize.base, color: colors.gray500, marginTop: 4 },

  splitRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.base },
  splitCard: { flex: 1, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: 1 },
  splitCardOwed: { backgroundColor: colors.successLight + "b0", borderColor: colors.success + "30" },
  splitCardOwe: { backgroundColor: colors.dangerLight + "b0", borderColor: colors.danger + "30" },
  splitIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  splitLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  splitAmount: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginTop: 2, fontVariant: ["tabular-nums"] },
  splitMeta: { fontSize: fontSize.xs, marginTop: 2, opacity: 0.8 },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  sectionTitle: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.gray900 },
  sectionLink: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary },

  activityCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.base,
  },
  activityRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  activityRowBorder: { borderTopWidth: 1, borderTopColor: colors.gray100 },
  activityIcon: { width: 38, height: 38, borderRadius: borderRadius.md, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  activityBody: { flex: 1, minWidth: 0 },
  activityTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.gray900 },
  activitySub: { fontSize: fontSize.sm, color: colors.gray500, marginTop: 1 },
  activityRight: { alignItems: "flex-end", flexShrink: 0 },
  activityAmount: { fontSize: fontSize.base, fontWeight: fontWeight.bold, fontVariant: ["tabular-nums"] },
  activityTime: { fontSize: fontSize.xs, color: colors.gray400, marginTop: 1 },

  skeletonWrapper: { gap: spacing.sm },

  emptyGroups: { alignItems: "center", paddingVertical: spacing["2xl"] },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.gray100, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.gray800 },
  emptySub: { fontSize: fontSize.base, color: colors.gray400, marginTop: spacing.xs, textAlign: "center" },
  emptyAction: { marginTop: spacing.base, backgroundColor: colors.primaryLight, paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderRadius: borderRadius.full },
  emptyActionText: { color: colors.primary, fontWeight: fontWeight.semibold, fontSize: fontSize.base },

  groupsRow: { gap: spacing.sm, paddingRight: spacing.base },
  groupCard: {
    width: 150,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  groupIcon: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  groupIconText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primaryDark },
  groupName: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.gray900 },
  groupNetOwed: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.success },
  groupNetOwe: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.danger },
  groupNetSettled: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray400 },
});
