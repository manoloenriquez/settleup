import { Share, StyleSheet, Text, TouchableOpacity, View, type ColorValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { buildNudgeMessage, buildSuggestedSettlements, simplifyDebts, formatAmount } from "@template/shared";
import type { CreditorPaymentProfile, CurrencyCode, MemberBalance, SimplifiedDebt, SuggestedSettlement } from "@template/shared";
import { Avatar } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type DebtSummaryProps = {
  /** Every amount here is in this currency. */
  currency: CurrencyCode;
  members: MemberBalance[];
  creditorProfiles?: CreditorPaymentProfile[];
  onSettle: (debt: SimplifiedDebt) => void;
  groupName?: string;
  webOrigin?: string;
  currentMemberId?: string | null;
};

export function DebtSummary({
  currency,
  members,
  creditorProfiles,
  onSettle,
  groupName,
  webOrigin,
  currentMemberId = null,
}: DebtSummaryProps) {
  const formatCents = (minor: number): string => formatAmount(minor, currency);
  const tokenByMemberId = new Map(members.map((m) => [m.member_id, m.share_token]));

  async function handleRemind(debt: SimplifiedDebt) {
    const token = tokenByMemberId.get(debt.from_member_id);
    const message = buildNudgeMessage({
      debtorName: debt.from_display_name,
      creditorName: debt.to_display_name,
      amountCents: debt.amount_cents,
      groupName: groupName ?? "your group",
      currency,
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

  function rowText(debt: SimplifiedDebt): { label: string; color: ColorValue; sign: string } {
    if (debt.to_member_id === currentMemberId) {
      return { label: `${debt.from_display_name} owes you`, color: colors.success, sign: "+" };
    }
    if (debt.from_member_id === currentMemberId) {
      return { label: `You owe ${debt.to_display_name}`, color: colors.danger, sign: "-" };
    }
    return {
      label: `${debt.from_display_name} owes ${debt.to_display_name}`,
      color: colors.gray700,
      sign: "",
    };
  }

  return (
    <View style={styles.container}>
      {/* Who owes whom */}
      <Text style={styles.sectionTitle}>Who owes whom</Text>
      <View style={styles.listCard}>
        {settlements.map((debt, i) => {
          const row = rowText(debt);
          const otherName =
            debt.from_member_id === currentMemberId
              ? debt.to_display_name
              : debt.from_display_name;
          return (
            <View key={i} style={[styles.debtRow, i > 0 && styles.debtRowBorder]}>
              <Avatar name={otherName} size={30} />
              <Text style={styles.debtText} numberOfLines={1}>{row.label}</Text>
              <Text style={[styles.debtAmount, { color: row.color }]}>
                {row.sign}
                {formatCents(debt.amount_cents)}
              </Text>
              {/* Remind someone else, never yourself. */}
              {debt.from_member_id !== currentMemberId && (
                <TouchableOpacity
                  style={styles.remindBtn}
                  onPress={() => void handleRemind(debt)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Send reminder to ${debt.from_display_name}`}
                >
                  <Ionicons name="notifications-outline" size={18} color={colors.gray600} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.settleBtn}
                onPress={() => onSettle(debt)}
                activeOpacity={0.7}
              >
                <Text style={styles.settleBtnText}>Settle</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },


  sectionTitle: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.gray900 },

  listCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  debtRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  debtRowBorder: { borderTopWidth: 1, borderTopColor: colors.gray100 },
  debtText: { fontSize: fontSize.sm, color: colors.gray700, flex: 1, minWidth: 0 },
  debtAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, fontVariant: ["tabular-nums"] },
  remindBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: borderRadius.full },
  settleBtn: { backgroundColor: colors.primaryLight, paddingHorizontal: spacing.md, minHeight: 44, justifyContent: "center", borderRadius: borderRadius.full },
  settleBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },




  settled: { alignItems: "center", padding: spacing.xl },
  settledIcon: { marginBottom: spacing.sm },
  settledText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.success },
});
