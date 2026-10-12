import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { dateRange, formatAmount, type MonthResult } from "@template/shared";
import { EmptyState } from "@/components/ui";
import { useBudget } from "@/hooks/useBudget";
import { useStackedLayout } from "@/hooks/useStackedLayout";
import { monthLabel } from "@/lib/dates";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

function signed(n: number, fmt: (n: number) => string): string {
  if (n === 0) return fmt(0);
  return n > 0 ? `+${fmt(n)}` : `−${fmt(-n)}`;
}

function monthOutcome(m: MonthResult, fmt: (n: number) => string): string {
  if (m.state === "current") return "In progress";
  const parts: string[] = [];
  if (m.overrunMinor > 0) {
    parts.push(
      m.monthEnd === "carry_overspend"
        ? `${fmt(m.overrunMinor)} over the limit, carried into the next month`
        : `${fmt(m.overrunMinor)} over the limit; next month started fresh`,
    );
  } else {
    parts.push(`${fmt(m.effectiveLimitMinor - m.spentMinor)} under the limit`);
  }
  if (m.closingCarryMinor > 0) parts.push(`${fmt(m.closingCarryMinor)} of weekly allowance unspent (kept, not moved forward)`);
  if (m.closingCarryMinor < 0 && m.overrunMinor === 0) parts.push(`${fmt(-m.closingCarryMinor)} over the weekly plan, covered within the limit`);
  return parts.join(". ");
}

export default function BudgetHistoryScreen() {
  const { state } = useBudget();
  // At accessibility text sizes a four-column table can't fit: each week becomes lines.
  const stacked = useStackedLayout();
  if (state.status !== "active") {
    return (
      <>
        <Stack.Screen options={{ title: "History" }} />
        <View style={styles.screen}>
          <EmptyState icon="time-outline" title="No history yet" description="Each week and month of your budget appears here." />
        </View>
      </>
    );
  }
  const fmt = (n: number): string => formatAmount(n, state.currency);
  return (
    <>
      <Stack.Screen options={{ title: "History" }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        {[...state.months].reverse().map((m) => (
          <View key={m.month} style={styles.card}>
            <View style={styles.monthHeader}>
              <Text style={styles.monthTitle} accessibilityRole="header">
                {monthLabel(m.month)}
              </Text>
              <Text style={[styles.monthValue, m.overrunMinor > 0 && styles.danger]}>
                {fmt(m.spentMinor)} of {fmt(m.effectiveLimitMinor)}
              </Text>
            </View>
            <Text style={styles.outcome}>{monthOutcome(m, fmt)}</Text>
            {m.openingMinor < 0 && <Text style={styles.outcome}>Started {fmt(-m.openingMinor)} lower: last month went over its limit.</Text>}
            {!stacked && (
            <View style={styles.tableHeader} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text style={[styles.cell, styles.cellWide, styles.head]}>Week</Text>
              <Text style={[styles.cell, styles.head]}>Allowance</Text>
              <Text style={[styles.cell, styles.head]}>Spent</Text>
              <Text style={[styles.cell, styles.head]}>Carry</Text>
            </View>
            )}
            {m.segments
              .filter((s) => s.state !== "future")
              .map((s) => (
                stacked ? (
                  <View key={s.start} style={styles.weekBlock} accessible>
                    <Text style={styles.weekTitle}>{dateRange(s.start, s.end)}{s.state === "current" ? " (this week)" : ""}</Text>
                    <Text style={styles.outcome}>Allowance {fmt(s.allowanceMinor)}</Text>
                    <Text style={[styles.outcome, s.spentMinor > s.allowanceMinor && styles.danger]}>Spent {fmt(s.spentMinor)}</Text>
                    {s.state !== "current" && <Text style={[styles.outcome, s.carryOutMinor < 0 && styles.danger]}>Carry {signed(s.carryOutMinor, fmt)}</Text>}
                  </View>
                ) : (
                <View
                  key={s.start}
                  style={styles.tableRow}
                  accessible
                  accessibilityLabel={`${dateRange(s.start, s.end)}: allowance ${fmt(s.allowanceMinor)}, spent ${fmt(s.spentMinor)}, ${s.carryOutMinor >= 0 ? "carried forward" : "short by"} ${fmt(Math.abs(s.carryOutMinor))}${s.state === "current" ? ", this week so far" : ""}`}
                >
                  <Text style={[styles.cell, styles.cellWide]}>
                    {dateRange(s.start, s.end)}
                    {s.state === "current" ? " ·" : ""}
                  </Text>
                  <Text style={styles.cell}>{fmt(s.allowanceMinor)}</Text>
                  <Text style={[styles.cell, s.spentMinor > s.allowanceMinor && styles.danger]}>{fmt(s.spentMinor)}</Text>
                  <Text style={[styles.cell, s.carryOutMinor < 0 && styles.danger]}>{s.state === "current" ? "—" : signed(s.carryOutMinor, fmt)}</Text>
                </View>
                )
              ))}
          </View>
        ))}
        <Text style={styles.footnote}>
          Carry is the running balance of the weekly plan: what you didn’t spend (+) or overspent (−) so far this month.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing["3xl"], gap: spacing.base },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    gap: spacing.sm,
  },
  monthHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: spacing.sm },
  monthTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.gray900 },
  monthValue: { fontSize: fontSize.base, color: colors.gray700, fontVariant: ["tabular-nums"] },
  outcome: { fontSize: fontSize.sm, lineHeight: 18, color: colors.gray600 },
  tableHeader: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: spacing.xs, marginTop: spacing.xs },
  tableRow: { flexDirection: "row", paddingVertical: spacing.xs, minHeight: 32, alignItems: "center" },
  cell: { flex: 1, fontSize: fontSize.sm, color: colors.gray800, textAlign: "right", fontVariant: ["tabular-nums"] },
  cellWide: { flex: 1.2, textAlign: "left" },
  head: { color: colors.gray500, fontWeight: fontWeight.semibold },
  danger: { color: colors.danger },
  weekBlock: { gap: 2, paddingVertical: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  weekTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.gray900 },
  footnote: { fontSize: fontSize.sm, lineHeight: 18, color: colors.gray500, textAlign: "center" },
});
