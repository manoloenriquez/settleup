import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatAmount, shortDate, type BudgetState } from "@template/shared";
import { AppButton } from "@/components/ui";
import { useStackedLayout } from "@/hooks/useStackedLayout";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type Props = {
  state: BudgetState;
  /** Inputs still loading: show a placeholder instead of low figures. */
  loading?: boolean;
  onOpen: () => void;
  /** Shown when there is no budget yet; omit to show nothing in that case. */
  onSetUp?: () => void;
};

/** Progress of `spent` against `total` as a 0–1 fraction (over = 1). */
function fraction(spent: number, total: number): number {
  if (total <= 0) return spent > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, spent / total));
}

/**
 * The three numbers people check: what's safe today, what's left this week
 * and this month. Tapping opens the full budget.
 */
export function BudgetSummaryCard({ state, loading, onOpen, onSetUp }: Props): React.ReactElement | null {
  const stacked = useStackedLayout();

  if (loading) {
    return (
      <View style={styles.card} accessible accessibilityLabel="Budget loading">
        <Text style={styles.title}>Budget</Text>
        <Text style={styles.meta}>Loading…</Text>
      </View>
    );
  }

  if (state.status === "off") {
    if (!onSetUp) return null;
    return (
      <View style={styles.card}>
        <View style={styles.promptHeader}>
          <View style={styles.icon}>
            <Ionicons name="pie-chart-outline" size={20} color={colors.primary} />
          </View>
          <Text style={styles.promptTitle} accessibilityRole="header">
            Set a budget
          </Text>
        </View>
        <Text style={styles.promptBody}>
          Choose what you want to spend each month. Talli works out what’s safe to spend each day, and what you don’t spend rolls into next week.
        </Text>
        <AppButton title="Set Up Budget" onPress={onSetUp} style={styles.promptButton} />
      </View>
    );
  }

  if (state.status === "not_started") {
    return (
      <TouchableOpacity style={styles.card} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Budget starts on ${shortDate(state.startDate)}`}>
        <Text style={styles.title}>Budget</Text>
        <Text style={styles.promptBody}>Starts on {shortDate(state.startDate)}.</Text>
      </TouchableOpacity>
    );
  }

  const { live, currency } = state;
  const weekAllowance = live.segment.allowanceMinor;
  const over = live.overWeekMinor > 0;
  const metrics = [
    { label: "Safe today", value: live.safeTodayMinor },
    { label: over ? "Over this week" : "Left this week", value: over ? live.overWeekMinor : live.availableWeekMinor, danger: over },
    { label: "Left this month", value: live.availableMonthMinor },
  ];
  const label = `Budget. ${metrics.map((m) => `${m.label}: ${formatAmount(m.value, currency)}`).join(". ")}. Opens your budget.`;

  return (
    <TouchableOpacity style={styles.card} onPress={onOpen} accessibilityRole="button" accessibilityLabel={label} activeOpacity={0.8}>
      <View style={styles.header}>
        <Text style={styles.title}>Budget</Text>
        <View style={styles.link}>
          <Text style={styles.linkText}>Details</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </View>
      </View>
      <View style={[styles.metrics, stacked && styles.metricsStacked]}>
        {metrics.map((m) => (
          <View key={m.label} style={stacked ? styles.metricStacked : styles.metric}>
            <Text style={styles.metricLabel}>{m.label}</Text>
            <Text
              style={[styles.metricValue, m.danger && styles.danger]}
              numberOfLines={1}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1.6}
            >
              {formatAmount(m.value, currency)}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${fraction(live.spentWeekMinor, Math.max(weekAllowance, 1)) * 100}%` },
            over && styles.fillOver,
          ]}
        />
      </View>
      <Text style={styles.meta}>
        {formatAmount(live.spentWeekMinor, currency)} of {formatAmount(weekAllowance, currency)} spent this week
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    gap: spacing.sm,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.gray600 },
  link: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 24 },
  linkText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.primary },
  metrics: { flexDirection: "row", gap: spacing.sm },
  metricsStacked: { flexDirection: "column", gap: spacing.xs },
  metric: { flex: 1, gap: 2 },
  // At accessibility sizes the amount gets its own line instead of being cut off.
  metricStacked: { gap: 2 },
  metricLabel: { fontSize: fontSize.sm, color: colors.gray500 },
  metricValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.gray900, fontVariant: ["tabular-nums"] },
  danger: { color: colors.danger },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.gray100, overflow: "hidden", marginTop: spacing.xs },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  fillOver: { backgroundColor: colors.danger },
  meta: { fontSize: fontSize.sm, color: colors.gray500, fontVariant: ["tabular-nums"] },
  promptHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  promptTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },
  promptBody: { fontSize: fontSize.base, lineHeight: 21, color: colors.gray600 },
  promptButton: { marginTop: spacing.xs },
});
