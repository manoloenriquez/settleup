import { StyleSheet, Text, View } from "react-native";
import { formatAmount, type SpendingSummary } from "@template/shared";
import { categoryMeta } from "@/lib/categories";
import { useStackedLayout } from "@/hooks/useStackedLayout";
import { monthLabel } from "@/lib/dates";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

/** This month's personal spending: one total per currency, top categories. */
export function MonthSummaryCard({ summary }: { summary: SpendingSummary }) {
  const stacked = useStackedLayout();
  const [primary, ...others] = summary.totals;
  const top = primary
    ? summary.byCategory.filter((item) => item.currency === primary.currency).slice(0, 3)
    : [];
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Spent in {monthLabel(summary.month)}</Text>
      {primary ? (
        <>
          <Text maxFontSizeMultiplier={1.4} style={styles.total} accessibilityRole="header" adjustsFontSizeToFit numberOfLines={1}>
            {formatAmount(primary.amountMinor, primary.currency)}
          </Text>
          <Text style={styles.meta}>
            {primary.count} {primary.count === 1 ? "expense" : "expenses"}
            {others.length > 0
              ? ` · plus ${others.map((total) => formatAmount(total.amountMinor, total.currency)).join(", ")}`
              : ""}
          </Text>
          <View style={styles.bars}>
            {top.map((item) => {
              const meta = categoryMeta(item.category);
              const share = primary.amountMinor > 0 ? item.amountMinor / primary.amountMinor : 0;
              return (
                <View
                  key={item.category}
                  style={stacked ? styles.barStack : styles.barRow}
                  accessible
                  accessibilityLabel={`${meta.label}: ${formatAmount(item.amountMinor, item.currency)}, ${Math.round(share * 100)} percent`}
                >
                  {/* At accessibility text sizes the name gets its own line instead of truncating. */}
                  <Text style={stacked ? styles.barLabelStacked : styles.barLabel} numberOfLines={stacked ? undefined : 1}>
                    {meta.label}
                  </Text>
                  <View style={stacked ? styles.barInnerStacked : styles.barInner}>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${Math.max(share * 100, 3)}%`, backgroundColor: meta.color }]} />
                    </View>
                    <Text style={styles.barAmount}>{formatAmount(item.amountMinor, item.currency)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : (
        <>
          <Text maxFontSizeMultiplier={1.4} style={styles.total}>Nothing yet</Text>
          <Text style={styles.meta}>Expenses you add this month show up here.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  label: { fontSize: fontSize.base, color: colors.gray500, fontWeight: fontWeight.medium },
  total: { fontSize: 34, fontWeight: fontWeight.bold, letterSpacing: -0.5, color: colors.gray900, fontVariant: ["tabular-nums"] },
  meta: { fontSize: fontSize.sm, color: colors.gray500 },
  bars: { gap: spacing.sm, marginTop: spacing.md },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barInner: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barInnerStacked: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barStack: { gap: spacing.xs },
  barLabelStacked: { fontSize: fontSize.sm, color: colors.gray700 },
  barLabel: { width: 96, fontSize: fontSize.sm, color: colors.gray700 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.gray100, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  barAmount: { fontSize: fontSize.sm, color: colors.gray700, fontVariant: ["tabular-nums"], minWidth: 72, textAlign: "right" },
});
