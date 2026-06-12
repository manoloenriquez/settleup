import { Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { buildNudgeMessage, buildSuggestedSettlements, simplifyDebts, formatCents } from "@template/shared";
import type { CreditorPaymentProfile, MemberBalance, SimplifiedDebt, SuggestedSettlement } from "@template/shared";
import { Avatar } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type DebtSummaryProps = {
  members: MemberBalance[];
  creditorProfiles?: CreditorPaymentProfile[];
  onSettle: (debt: SimplifiedDebt) => void;
  groupName?: string;
  webOrigin?: string;
};

export function DebtSummary({ members, creditorProfiles, onSettle, groupName, webOrigin }: DebtSummaryProps) {
  const tokenByMemberId = new Map(members.map((m) => [m.member_id, m.share_token]));

  async function handleRemind(debt: SimplifiedDebt) {
    const token = tokenByMemberId.get(debt.from_member_id);
    const message = buildNudgeMessage({
      debtorName: debt.from_display_name,
      creditorName: debt.to_display_name,
      amountCents: debt.amount_cents,
      groupName: groupName ?? "your group",
      link: token && webOrigin ? `${webOrigin}/p/${token}` : null,
    });
    try {
      await Share.share({ message });
    } catch {
      // User cancelled — no action needed
    }
  }
  const settlements: SuggestedSettlement[] = creditorProfiles?.length
    ? buildSuggestedSettlements(members, creditorProfiles)
    : simplifyDebts(members).map((d) => ({ ...d, creditor_profile: null }));

  if (settlements.length === 0) {
    return (
      <View style={styles.settled}>
        <Ionicons name="checkmark-circle" size={40} color={colors.success} style={styles.settledIcon} />
        <Text style={styles.settledText}>All settled up!</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {settlements.map((debt, i) => (
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
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.remindBtn}
                onPress={() => void handleRemind(debt)}
                activeOpacity={0.7}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Send reminder to ${debt.from_display_name}`}
              >
                <Ionicons name="notifications-outline" size={13} color={colors.warningDark} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.settleBtn}
                onPress={() => onSettle(debt)}
                activeOpacity={0.7}
              >
                <Text style={styles.settleBtnText}>Settle</Text>
              </TouchableOpacity>
            </View>
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
  actionRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  remindBtn: { backgroundColor: colors.warningLight, padding: 5, borderRadius: borderRadius.full },
  settleBtn: { backgroundColor: colors.primaryLight, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full },
  settleBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },

  settled: { alignItems: "center", padding: spacing.xl },
  settledIcon: { marginBottom: spacing.sm },
  settledText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.success },
});
