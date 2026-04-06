import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { buildSuggestedSettlements, simplifyDebts, formatCents } from "@template/shared";
import type { CreditorPaymentProfile, MemberBalance, SimplifiedDebt, SuggestedSettlement } from "@template/shared";
import { Avatar } from "@/components/ui";
import { colors, fontSize, fontWeight, spacing, borderRadius } from "@/theme";

type DebtSummaryProps = {
  members: MemberBalance[];
  creditorProfiles?: CreditorPaymentProfile[];
  onSettle: (debt: SimplifiedDebt) => void;
};

export function DebtSummary({ members, creditorProfiles, onSettle }: DebtSummaryProps) {
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
            <TouchableOpacity
              style={styles.settleBtn}
              onPress={() => onSettle(debt)}
              activeOpacity={0.7}
            >
              <Text style={styles.settleBtnText}>Settle</Text>
            </TouchableOpacity>
          </View>
          {debt.creditor_profile && (debt.creditor_profile.gcash_number || debt.creditor_profile.bank_account_number) && (
            <View style={styles.paymentInfo}>
              {debt.creditor_profile.gcash_number ? (
                <Text style={styles.paymentText}>
                  GCash: {debt.creditor_profile.gcash_number}
                  {debt.creditor_profile.gcash_name ? ` (${debt.creditor_profile.gcash_name})` : ""}
                </Text>
              ) : null}
              {debt.creditor_profile.gcash_qr_url ? (
                <Image source={{ uri: debt.creditor_profile.gcash_qr_url }} style={styles.qrImage} />
              ) : null}
              {debt.creditor_profile.bank_name && debt.creditor_profile.bank_account_number ? (
                <Text style={styles.paymentText}>
                  {debt.creditor_profile.bank_name}: {debt.creditor_profile.bank_account_number}
                </Text>
              ) : null}
              {debt.creditor_profile.bank_qr_url ? (
                <Image source={{ uri: debt.creditor_profile.bank_qr_url }} style={styles.qrImage} />
              ) : null}
            </View>
          )}
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
  paymentInfo: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  paymentText: { fontSize: fontSize.xs, color: colors.gray500, fontFamily: "monospace" },
  qrImage: { width: 200, height: 200, alignSelf: "center" as const, marginTop: spacing.sm, borderRadius: borderRadius.md },
  settled: { alignItems: "center", padding: spacing.xl },
  settledIcon: { marginBottom: spacing.sm },
  settledText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.success },
});
