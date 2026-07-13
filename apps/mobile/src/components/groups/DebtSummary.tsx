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
  currentMemberId?: string | null;
};

export function DebtSummary({
  members,
  creditorProfiles,
  onSettle,
  groupName,
  webOrigin,
  currentMemberId = null,
}: DebtSummaryProps) {
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

  const totalCents = settlements.reduce((sum, d) => sum + d.amount_cents, 0);
  const toReceiveCents = settlements
    .filter((d) => d.to_member_id === currentMemberId)
    .reduce((sum, d) => sum + d.amount_cents, 0);
  const toPayCents = settlements
    .filter((d) => d.from_member_id === currentMemberId)
    .reduce((sum, d) => sum + d.amount_cents, 0);
  // "Settle balance" targets my own debt first; creditors just record receipt.
  const myDebt =
    settlements.find((d) => d.from_member_id === currentMemberId) ??
    settlements.find((d) => d.to_member_id === currentMemberId) ??
    settlements[0];

  function rowText(debt: SimplifiedDebt): { label: string; color: string; sign: string } {
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
      {/* Settle-with-N-payments banner */}
      <View style={styles.banner}>
        <View style={styles.bannerIcon}>
          <Ionicons name="flash" size={15} color={colors.white} />
        </View>
        <View style={styles.bannerBody}>
          <Text style={styles.bannerTitle}>
            You can settle with {settlements.length} payment{settlements.length !== 1 ? "s" : ""}
          </Text>
          <Text style={styles.bannerSub}>{formatCents(totalCents)} will be settled</Text>
        </View>
      </View>

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
              <TouchableOpacity
                style={styles.remindBtn}
                onPress={() => void handleRemind(debt)}
                activeOpacity={0.7}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Send reminder to ${debt.from_display_name}`}
              >
                <Ionicons name="notifications-outline" size={13} color={colors.gray500} />
              </TouchableOpacity>
              <TouchableOpacity
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

      {/* Suggested settlements */}
      <View style={styles.suggestedCard}>
        <Text style={styles.suggestedTitle}>Suggested settlements</Text>
        {settlements.map((debt, i) => (
          <View key={`s-${i}`} style={styles.suggestedRow}>
            <Avatar name={debt.from_display_name} size={22} />
            <Text style={styles.suggestedText} numberOfLines={1}>
              <Text style={styles.suggestedName}>
                {debt.from_member_id === currentMemberId ? "You" : debt.from_display_name}
              </Text>
              {debt.from_member_id === currentMemberId ? " pay " : " pays "}
              <Text style={styles.suggestedName}>
                {debt.to_member_id === currentMemberId ? "you" : debt.to_display_name}
              </Text>
            </Text>
            <Text style={styles.suggestedAmount}>{formatCents(debt.amount_cents)}</Text>
          </View>
        ))}
        <View style={styles.suggestedFooter}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={11} color={colors.white} />
          </View>
          <Text style={styles.suggestedFooterText}>Settles everyone</Text>
        </View>
      </View>

      {/* Totals + CTA */}
      {currentMemberId && (toReceiveCents > 0 || toPayCents > 0) && (
        <>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {toReceiveCents >= toPayCents ? "Total to receive" : "Total to pay"}
            </Text>
            <Text
              style={[
                styles.totalAmount,
                { color: toReceiveCents >= toPayCents ? colors.success : colors.danger },
              ]}
            >
              {formatCents(Math.max(toReceiveCents, toPayCents))}
            </Text>
          </View>
          {myDebt && (
            <TouchableOpacity
              style={styles.settleAllBtn}
              onPress={() => onSettle(myDebt)}
              activeOpacity={0.85}
            >
              <Text style={styles.settleAllText}>Settle balance</Text>
              <Ionicons name="send" size={15} color={colors.white} />
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary + "30",
    padding: spacing.base,
  },
  bannerIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  bannerBody: { flex: 1, minWidth: 0 },
  bannerTitle: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.gray900 },
  bannerSub: { fontSize: fontSize.sm, color: colors.gray600, marginTop: 1 },

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
  remindBtn: { backgroundColor: colors.gray100, padding: 5, borderRadius: borderRadius.full },
  settleBtn: { backgroundColor: colors.primaryLight, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full },
  settleBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },

  suggestedCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.primary + "50",
    padding: spacing.base,
    gap: spacing.sm,
  },
  suggestedTitle: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.gray900, marginBottom: 2 },
  suggestedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  suggestedText: { fontSize: fontSize.sm, color: colors.gray700, flex: 1, minWidth: 0 },
  suggestedName: { fontWeight: fontWeight.semibold, color: colors.gray900 },
  suggestedAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.gray900, fontVariant: ["tabular-nums"] },
  suggestedFooter: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.gray100, paddingTop: spacing.sm, marginTop: 2 },
  checkCircle: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  suggestedFooterText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray600 },

  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  totalLabel: { fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.gray600 },
  totalAmount: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, fontVariant: ["tabular-nums"] },

  settleAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
  },
  settleAllText: { color: colors.white, fontWeight: fontWeight.bold, fontSize: fontSize.md },

  settled: { alignItems: "center", padding: spacing.xl },
  settledIcon: { marginBottom: spacing.sm },
  settledText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.success },
});
