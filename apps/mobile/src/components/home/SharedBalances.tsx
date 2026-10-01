import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  formatAmount,
  groupNetsByCurrency,
  nonZeroNets,
  owedTotalsByCurrency,
  type CurrencyAmount,
} from "@template/shared";
import { useDashboardSummaries } from "@/hooks/useDashboard";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";
import { SkeletonCard, ErrorBanner } from "@/components/ui";
import { ROUTES } from "@/lib/routes";

function signed(amount: CurrencyAmount): string {
  return `${amount.amountMinor > 0 ? "+" : "−"}${formatAmount(Math.abs(amount.amountMinor), amount.currency)}`;
}

/**
 * Balances with other people (signed-in users only). One line per currency:
 * amounts in different currencies are never added or converted.
 */
export function SharedBalances() {
  const router = useRouter();
  const { data: summaries, isLoading, refetch, error } = useDashboardSummaries();
  const list = summaries ?? [];
  const nets = nonZeroNets(list);
  const owed = owedTotalsByCurrency(list);
  const groupNets = groupNetsByCurrency(list);
  // Every per-currency summary lists all of my groups; take names from the first.
  const groups = list[0]?.groups ?? [];

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

      {error && (
        <ErrorBanner
          message={error instanceof Error ? error.message : "Couldn't load your balances."}
          onRetry={() => void refetch()}
        />
      )}

      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>Your balance with others</Text>
        {nets.length === 0 ? (
          <Text style={[styles.heroAmount, { color: colors.gray900 }]}>All clear</Text>
        ) : (
          nets.map((net) => (
            <Text
              key={net.currency}
              style={[styles.heroAmount, { color: net.amountMinor > 0 ? colors.primaryDark : colors.danger }]}
              accessibilityLabel={
                net.amountMinor > 0
                  ? `Others owe you ${formatAmount(net.amountMinor, net.currency)}`
                  : `You owe ${formatAmount(-net.amountMinor, net.currency)}`
              }
            >
              {signed(net)}
            </Text>
          ))
        )}
        <Text style={styles.heroSub}>
          {nets.length === 0
            ? "Nobody owes anybody"
            : nets.length > 1
              ? "Each currency is kept separate"
              : (nets[0]?.amountMinor ?? 0) > 0
                ? "Others owe you"
                : "You owe more than you’re owed"}
        </Text>
      </View>

      {owed.map((row) => (
        <View key={row.currency} style={styles.splitRow}>
          <View style={[styles.splitCard, styles.splitCardOwed]}>
            <Text style={[styles.splitLabel, { color: colors.successDark }]}>You are owed</Text>
            <Text style={[styles.splitAmount, { color: colors.successDark }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatAmount(row.owedToMe, row.currency)}
            </Text>
            <Text style={[styles.splitMeta, { color: colors.successDark }]}>
              from {row.owedFrom} {row.owedFrom === 1 ? "person" : "people"}
            </Text>
          </View>
          <View style={[styles.splitCard, styles.splitCardOwe]}>
            <Text style={[styles.splitLabel, { color: colors.danger }]}>You owe</Text>
            <Text style={[styles.splitAmount, { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatAmount(row.iOwe, row.currency)}
            </Text>
            <Text style={[styles.splitMeta, { color: colors.danger }]}>
              to {row.oweTo} {row.oweTo === 1 ? "person" : "people"}
            </Text>
          </View>
        </View>
      ))}

      {isLoading ? (
        <View style={styles.skeletonWrapper}>
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
            onPress={() => router.push(ROUTES.newGroup)}
            accessibilityRole="button"
          >
            <Text style={styles.emptyActionText}>Create Group</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupsRow}>
          {groups.map((group) => {
            const balances = groupNets.get(group.id) ?? [];
            return (
              <TouchableOpacity
                key={group.id}
                style={styles.groupCard}
                onPress={() => router.push(`/(protected)/groups/${group.id}`)}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <View style={styles.groupIcon}>
                  <Text style={styles.groupIconText}>{group.name.trim()[0]?.toUpperCase() ?? "G"}</Text>
                </View>
                <Text style={styles.groupName} numberOfLines={1}>
                  {group.name}
                </Text>
                {balances.length === 0 ? (
                  <Text style={styles.groupNetSettled}>Settled up</Text>
                ) : (
                  balances.map((balance) => (
                    <Text
                      key={balance.currency}
                      style={balance.amountMinor > 0 ? styles.groupNetOwed : styles.groupNetOwe}
                      numberOfLines={1}
                    >
                      {balance.amountMinor > 0
                        ? `You’re owed ${formatAmount(balance.amountMinor, balance.currency)}`
                        : `You owe ${formatAmount(-balance.amountMinor, balance.currency)}`}
                    </Text>
                  ))
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
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm, marginTop: spacing.sm },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },
  sectionLink: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.primary },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroLabel: { fontSize: fontSize.base, color: colors.gray500, fontWeight: fontWeight.medium },
  heroAmount: { fontSize: 30, fontWeight: fontWeight.bold, letterSpacing: -0.5, marginTop: 4, fontVariant: ["tabular-nums"] },
  heroSub: { fontSize: fontSize.base, color: colors.gray500, marginTop: 4 },
  splitRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  splitCard: { flex: 1, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: 1 },
  splitCardOwed: { backgroundColor: colors.successLight + "b0", borderColor: colors.success + "30" },
  splitCardOwe: { backgroundColor: colors.dangerLight + "b0", borderColor: colors.danger + "30" },
  splitLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  splitAmount: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginTop: 2, fontVariant: ["tabular-nums"] },
  splitMeta: { fontSize: fontSize.xs, marginTop: 2 },
  skeletonWrapper: { gap: spacing.sm },
  emptyGroups: { alignItems: "center", paddingVertical: spacing["2xl"] },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.gray100, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.gray800 },
  emptySub: { fontSize: fontSize.base, color: colors.gray500, marginTop: spacing.xs, textAlign: "center" },
  emptyAction: { marginTop: spacing.base, backgroundColor: colors.primaryLight, paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderRadius: borderRadius.full, minHeight: 44, justifyContent: "center" },
  emptyActionText: { color: colors.primary, fontWeight: fontWeight.semibold, fontSize: fontSize.base },
  groupsRow: { gap: spacing.sm, paddingRight: spacing.base },
  groupCard: {
    width: 160,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  groupIcon: { width: 38, height: 38, borderRadius: borderRadius.md, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  groupIconText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primaryDark },
  groupName: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.gray900 },
  groupNetOwed: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.success },
  groupNetOwe: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.danger },
  groupNetSettled: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.gray500 },
});
