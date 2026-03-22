import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { simplifyDebts, formatCents } from "@template/shared";
import type { MemberBalance, SimplifiedDebt } from "@template/shared";
import { Avatar } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type DebtSummaryProps = {
  members: MemberBalance[];
  onSettle: (debt: SimplifiedDebt) => void;
};

export function DebtSummary({ members, onSettle }: DebtSummaryProps) {
  const debts = simplifyDebts(members);

  if (debts.length === 0) {
    return (
      <View style={styles.settled}>
        <Text style={styles.settledEmoji}>🎉</Text>
        <Text style={styles.settledText}>All settled up!</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {debts.map((debt, i) => (
        <View key={i} style={styles.debtRow}>
          <View style={styles.debtInfo}>
            <Avatar name={debt.from_display_name} size={28} />
            <Text style={styles.debtText}>
              <Text style={styles.debtName}>{debt.from_display_name}</Text>
              {" owes "}
              <Text style={styles.debtName}>{debt.to_display_name}</Text>
            </Text>
          </View>
          <View style={styles.debtRight}>
            <Text style={styles.debtAmount}>{formatCents(debt.amount_cents)}</Text>
            <TouchableOpacity
              style={styles.settleBtn}
              onPress={() => onSettle(debt)}
              activeOpacity={0.7}
            >
              <Text style={styles.settleBtnText}>Settle</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  debtRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  debtInfo: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  debtText: { fontSize: fontSize.sm, color: colors.gray700, flex: 1, flexWrap: "wrap" },
  debtName: { fontWeight: fontWeight.semibold, color: colors.gray900 },
  debtRight: { alignItems: "flex-end", gap: spacing.xs },
  debtAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.danger },
  settleBtn: { backgroundColor: colors.primaryLight, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full },
  settleBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  settled: { alignItems: "center", padding: spacing.xl },
  settledEmoji: { fontSize: 36, marginBottom: spacing.sm },
  settledText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.success },
});
